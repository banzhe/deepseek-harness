/**
 * Question fields both `ask_user_question` variants declare, and the model-key
 * normalization they apply before reading a question.
 */

import { ToolArgsError, validateArgs } from '@deepseek-ai/dsh-tools'
import type { InferArgs } from '@deepseek-ai/dsh-tools'

/** The question item both tool variants declare. */
export const QUESTION_ITEM = {
  type: 'object',
  additionalProperties: true,
  properties: {
    id: { type: 'string', required: true, description: 'Stable id for this question; echoed in the answer.' },
    question: { type: 'string', required: true, description: 'The specific question to ask the user.' },
    header: {
      type: 'string',
      description: 'Optional short heading for the question, such as "Confirm" or "Choose Mode".',
    },
    options: {
      type: 'array',
      description: 'Optional choices to show the user. If you recommend one, put it first and append "(Recommended)" to that label.',
      items: {
        type: 'object',
        additionalProperties: true,
        properties: {
          label: { type: 'string', required: true, description: 'Short user-facing option label.' },
          description: { type: 'string', description: 'One sentence explaining the tradeoff or impact.' },
        },
      },
    },
    multi_select: {
      type: 'boolean',
      description: 'Whether the user may select more than one option. Defaults to false.',
    },
  },
} as const

/** One question batch, used to re-validate the questions after key normalization. */
const QUESTION_BATCH = {
  questions: { type: 'array', required: true, items: QUESTION_ITEM },
} as const

/** One question as both tool variants declare it. */
export type ToolQuestion = InferArgs<typeof QUESTION_BATCH>['questions'][number]

/** Whether a model-supplied JSON value is a JSON object. */
function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Copy own entries under whitespace-free keys.
 * @param value - model-supplied JSON object.
 * @returns The same entries keyed without surrounding whitespace; a later duplicate key wins.
 */
function trimKeys(value: object): Record<string, unknown> {
  const fields: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value)) fields[key.trim()] = entry
  return fields
}

/** Trim one question's own keys and those of its options. */
function trimQuestion(question: object): Record<string, unknown> {
  const fields = trimKeys(question)
  const options = fields.options
  if (Array.isArray(options)) {
    fields.options = options.map((option: unknown) => isJsonObject(option) ? trimKeys(option) : option)
  }
  return fields
}

/**
 * Recover question fields the model spelled with whitespace around the key, and
 * validate the result against the question schema.
 *
 * Both item schemas admit unknown keys, so a question whose `options` key
 * carried a trailing space passed validation unnoticed and reached the Client
 * as a question with no choices. A key that stays unknown, or a recovered value
 * that does not match the schema, still fails: the model sees the violation and
 * retries instead of the user seeing an empty card.
 *
 * @param questions - model-supplied questions the tool schema already accepted.
 * @returns The same questions with whitespace-free keys.
 * @throws {ToolArgsError} when a recovered question does not match the question schema.
 */
export function normalizeQuestions(questions: readonly object[]): ToolQuestion[] {
  const batch = { questions: questions.map(question => trimQuestion(question)) }
  const violations = validateArgs(QUESTION_BATCH, batch)
  if (violations.length > 0) throw new ToolArgsError(violations)
  return batch.questions as ToolQuestion[]
}
