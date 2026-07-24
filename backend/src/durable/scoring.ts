export type Mode = 'solo' | 'seer_skeptic' | 'multiplayer_seer'
export type Decision = 'follow' | 'bluff' | 'solo'

export interface ScoreResult {
  tokens: Record<string, number>
}

export function computeScores(params: {
  mode: Mode
  isCorrect: Record<string, boolean>
  decisions: Record<string, Decision>
  trustedSeerId?: string
  seerIds: string[]
  skepticId?: string
  allPlayerIds: string[]
}): ScoreResult {
  const tokens: Record<string, number> = {}
  for (const pid of params.allPlayerIds) {
    tokens[pid] = 0
  }

  if (params.mode === 'solo') {
    for (const pid of params.allPlayerIds) {
      if (params.isCorrect[pid]) {
        tokens[pid] = 2
      }
    }
    return { tokens }
  }

  // Seer & Skeptic modes
  const skepticId = params.skepticId
  if (!skepticId) return { tokens }

  const isCorrect = params.isCorrect[skepticId] ?? false
  const decision = params.decisions[skepticId] ?? 'solo'
  const trustedSeer = params.trustedSeerId

  if (decision === 'follow') {
    if (isCorrect) {
      // Seer persuaded correctly
      for (const seerId of params.seerIds) {
        tokens[seerId] = seerId === trustedSeer ? 2 : (params.mode === 'multiplayer_seer' ? 0 : 0)
      }
      // Only trusted seer gets tokens; if only one seer, that's the trusted one
      if (trustedSeer) tokens[trustedSeer] = 2
      else if (params.seerIds.length === 1) tokens[params.seerIds[0]] = 2
      tokens[skepticId] = 2
    } else {
      // Persuaded but wrong
      if (trustedSeer) tokens[trustedSeer] = 1
      else if (params.seerIds.length === 1) tokens[params.seerIds[0]] = 1
      tokens[skepticId] = 0
    }
  } else if (decision === 'bluff') {
    if (isCorrect) {
      // Skeptic called bluff and was right
      tokens[skepticId] = 2
      // Seers get 0
    } else {
      // Skeptic called bluff but was wrong
      // No one gets tokens
    }
  } else {
    // 'solo' - went independent
    if (isCorrect) {
      tokens[skepticId] = 2
    }
  }

  return { tokens }
}
