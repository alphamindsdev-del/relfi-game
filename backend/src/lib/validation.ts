import { z } from 'zod'

export const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  display_name: z.string().min(1).max(50),
})

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export const magicLinkSchema = z.object({
  email: z.string().email(),
})

export const categorySchema = z.object({
  name: z.string().min(1).max(100),
  short_code: z.string().max(10).optional(),
  color_hex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  icon_key: z.string().max(50).optional(),
  definition: z.string().max(1000).optional(),
})

export const deckSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  category_ids: z.array(z.string()).optional(),
})

export const cardSchema = z.object({
  statement_text: z.string().max(2000).optional(),
  statement_image_url: z.string().max(500).optional(),
  correct_category_id: z.string().min(1),
  friction_explanation: z.string().max(2000).optional(),
  clue_variant: z.enum(['none', 'narrowed_list', 'partial_text', 'exact_answer']).default('none'),
  clue_payload: z.string().optional(),
  clue_type: z.enum(['none', 'text', 'image']).default('none'),
  clue_content: z.string().optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
})

export const createRoomSchema = z.object({
  deck_id: z.string(),
  mode: z.enum(['solo', 'seer_skeptic', 'multiplayer_seer']),
})

export const lockAnswerSchema = z.object({
  category_id: z.string(),
  decision: z.enum(['follow', 'solo']).optional(),
  trusted_seer_id: z.string().optional(),
})

export const updateProfileSchema = z.object({
  display_name: z.string().min(1).max(50).optional(),
  avatar_url: z.string().max(500).optional(),
})
