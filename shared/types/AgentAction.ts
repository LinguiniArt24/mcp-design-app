import type z from 'zod'
import type * as AllSchemas from '../schema/AgentActionSchemas'

/** Extract inferred type from a Zod schema */
type ExtractZodType<T> = T extends z.ZodType<infer U> ? U : never

/** All Zod schemas exported from AgentActionSchemas.ts */
export type AgentActionSchema = Extract<(typeof AllSchemas)[keyof typeof AllSchemas], z.ZodType>

/**
 * Union of all agent action types, automatically derived from exported schemas.
 * Adding a schema export to AgentActionSchemas.ts adds it to this union.
 */
export type AgentAction = ExtractZodType<AgentActionSchema>
