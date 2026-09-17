"""Regression tests for request injection and stage isolation."""

import copy
import unittest
from datetime import datetime, timezone

from core.engine import process_message
from core.injection import InjectionContext, process_request, validate_request_rules


class InjectionTests(unittest.TestCase):
    def setUp(self):
        self.ctx = InjectionContext(user_id="42", user_nickname='A&B"', session_id="chat")
        self.now = datetime(2026, 9, 17, 12, tzinfo=timezone.utc)
        self.doc = {"rules": [{
            "id": "request", "target": "llm_request", "enabled": True,
            "pipeline": [{"id": "inject", "label": "s1", "config": {
                "position": "message_end", "template": "{{date}}", "schedule": "daily",
            }}],
        }]}
        self.config = self.doc["rules"][0]["pipeline"][0]["config"]

    def test_daily_is_per_step_and_only_counts_matching_rules(self):
        other = copy.deepcopy(self.doc["rules"][0])
        other["id"] = "conditional"
        other["pipeline"][0]["config"]["when"] = {"message_contains": "later"}
        self.doc["rules"].append(other)
        first = process_request(self.doc, "hello", "", self.ctx, now=self.now)
        second = process_request(self.doc, "later", "", self.ctx, daily_dates=first.daily_dates, now=self.now)
        self.assertEqual([b["rule_id"] for b in first.blocks], ["request"])
        self.assertEqual([b["rule_id"] for b in second.blocks], ["conditional"])
        third = process_request(self.doc, "later", "", self.ctx, daily_dates=second.daily_dates, now=self.now)
        self.assertEqual(third.blocks, [])

    def test_timezone_rollover_and_new_conversation(self):
        first = process_request(self.doc, "hello", "", self.ctx, now=self.now)
        next_day = datetime(2026, 9, 17, 16, tzinfo=timezone.utc)
        second = process_request(self.doc, "hello", "", self.ctx, daily_dates=first.daily_dates, now=next_day)
        self.assertEqual(second.date, "2026-09-18")
        self.assertEqual(len(second.blocks), 1)
        self.ctx.conversation_id = "new-conversation"
        reset = process_request(self.doc, "hello", "", self.ctx, daily_dates=first.daily_dates, now=self.now)
        self.assertEqual(len(reset.blocks), 1)

    def test_daily_state_survives_step_relabel(self):
        self.config["state_id"] = "persistent-step"
        first = process_request(self.doc, "hello", "", self.ctx, now=self.now)
        self.doc["rules"][0]["pipeline"][0]["label"] = "s2"
        second = process_request(self.doc, "hello", "", self.ctx, daily_dates=first.daily_dates, now=self.now)
        self.assertEqual(second.blocks, [])

    def test_wrapping_escapes_xml_and_preserves_raw_variables(self):
        self.config.update(position="message_replace", schedule="always", template='<msg user="{{user}}" id="{{id}}">{{content}}</msg>')
        result = process_request(self.doc, "<hi>&", "", self.ctx, now=self.now)
        self.assertEqual(result.prompt, '<msg user="A&amp;B&quot;" id="42">&lt;hi&gt;&amp;</msg>')
        self.assertEqual(result.daily_dates, {})

    def test_all_positions_and_temporary_parts(self):
        for position in ("message_start", "message_end", "message_replace", "system_start", "system_end"):
            with self.subTest(position=position):
                self.config.update(position=position, template="extra", ephemeral=position == "message_end")
                result = process_request(self.doc, "hello", "system", self.ctx, now=self.now)
                if position == "message_start":
                    self.assertEqual(result.prompt, "extra\n\nhello")
                elif position == "message_replace":
                    self.assertEqual(result.prompt, "extra")
                elif position == "system_start":
                    self.assertEqual(result.system_prompt, "extra\nsystem")
                elif position == "system_end":
                    self.assertEqual(result.system_prompt, "system\nextra")
                else:
                    self.assertEqual(result.parts, [{"text": "extra", "ephemeral": True}])

    def test_empty_or_already_wrapped_replacement_does_not_count(self):
        self.config.update(position="message_replace", template="replacement")
        for prompt in ("", '<msg user="a">hello</msg>'):
            result = process_request(self.doc, prompt, "", self.ctx, now=self.now)
            self.assertEqual(result.blocks, [])
            self.assertEqual(result.daily_dates, {})

    def test_conditions_and_blank_whitelist(self):
        self.config["when"] = {"chat": "group", "user_ids": ["42"], "group_ids": ["99"], "message_regex": "^hi"}
        self.assertFalse(process_request(self.doc, "hi", "", self.ctx).blocks)
        self.ctx.group_id = "99"
        self.assertTrue(process_request(self.doc, "hi", "", self.ctx).blocks)
        self.config["when"] = {"user_ids": ["", " "]}
        self.assertTrue(process_request(self.doc, "hi", "", self.ctx).blocks)

    def test_stage_isolation_and_legacy_outbound(self):
        self.doc["rules"].append({"id": "old", "pipeline": [{"id": "replace", "config": {"from": "hello", "to": "bye"}}]})
        self.assertEqual(process_message(self.doc, "hello").to_legacy_output(), "bye")
        self.assertEqual(process_request(self.doc, "hello", "", self.ctx).prompt, "hello")
        self.assertEqual(process_message(self.doc, "hello", rule_ids=["request"]).to_legacy_output(), "hello")

    def test_always_before_daily_and_no_input_mutation(self):
        self.config.update(position="message_end", template="{{prompt}}")
        always = copy.deepcopy(self.doc["rules"][0])
        always.update(id="always", priority=-10)
        always["pipeline"][0]["config"].update(schedule="always", position="message_start", template="prefix")
        self.doc["rules"].append(always)
        before = copy.deepcopy(self.doc)
        dates = {}
        result = process_request(self.doc, "hello", "", self.ctx, daily_dates=dates)
        self.assertEqual([b["rule_id"] for b in result.blocks], ["always", "request"])
        self.assertEqual(result.parts[0]["text"], "prefix\n\nhello")
        self.assertEqual(self.doc, before)
        self.assertEqual(dates, {})

    def test_disabled_rule_can_be_previewed_explicitly(self):
        self.doc["rules"][0]["enabled"] = False
        self.assertFalse(process_request(self.doc, "hi", "", self.ctx).blocks)
        self.assertTrue(process_request(self.doc, "hi", "", self.ctx, rule_ids=["request"]).blocks)

    def test_invalid_stage_or_injection_rejected(self):
        validate_request_rules(self.doc)
        for patch in ({"position": "invalid"}, {"ephemeral": True, "position": "system_end"}, {"when": {"message_regex": "["}}):
            broken = copy.deepcopy(self.doc)
            broken["rules"][0]["pipeline"][0]["config"].update(patch)
            with self.assertRaises(ValueError):
                validate_request_rules(broken)
        self.doc["rules"][0]["target"] = "outbound"
        with self.assertRaises(ValueError):
            validate_request_rules(self.doc)


if __name__ == "__main__":
    unittest.main()
