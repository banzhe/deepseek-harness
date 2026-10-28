# ask_user_question recovers whitespace-padded model keys

- Kind: fix
- Status: local
- Identifying paths:
  - packages/interaction/tool-ask-user/src/questions.ts
  - packages/interaction/tool-ask-user/src/index.ts
  - packages/interaction/tool-ask-user/src/timed.ts
  - packages/interaction/tool-ask-user/tests/tool-ask-user.spec.ts
- Unique strings or tests:
  - `normalizeQuestions`
  - `QUESTION_ITEM`
  - `recovers question fields whose keys carry surrounding whitespace`
  - `rejects a recovered question field that does not match the question schema`

## Intent

Both `ask_user_question` variants declare `additionalProperties: true` on the question and option items, so a model that emits `"options "` (trailing space) passes validation silently and the question reaches the Client with no choices: the card degrades to an unattributed free-form input while the model keeps waiting. The tool now trims every own key of a question and of its options before reading them, then re-validates the recovered value against the shared `QUESTION_ITEM` schema, so an unrecoverable or malformed value still fails loudly as `INVALID_ARGS` instead of reaching the user as an empty card. Acceptance of unknown keys is unchanged.

## Already-on-master test

Search the base for `normalizeQuestions` under `packages/interaction/tool-ask-user/src/`. While the question item schema is inlined in both `index.ts` and `timed.ts` and neither tool trims model keys, the padded-key degradation is still present.
