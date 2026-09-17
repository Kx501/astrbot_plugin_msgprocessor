# Changelog

## Unreleased

- Add the `LLM 请求` rule category with an `注入` module for request templates, conditions, positions and per-step daily scheduling.
- Keep existing rules in `消息发送` by default. The existing rule editor remains in place; its former sending-only scope is now the `消息发送` category. Module groups remain `通用` and `标记`.
- Add InfoInjection rule import and request previews. Imported rules use sequential module execution; existing daily state is not migrated.
- Preserve MsgDebugger injection tracing and isolate LLM request rules from outgoing message rules.
