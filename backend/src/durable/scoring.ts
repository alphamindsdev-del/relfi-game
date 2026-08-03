export type Mode = 'solo' | 'seer_skeptic' | 'multiplayer_seer'
export type Decision = 'follow' | 'solo'

export interface ScoreResult {
  tokens: Record<string, number>
}

export function computeScores(params: {
  mode: Mode
  isCorrect: Record<string, boolean>
  decisions: Record<string, Decision>
  seerId?: string
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

  // Seer modes: exactly one seer. Every other player decides to follow the
  // seer's pick or to go solo and trust their own answer.
  const seerId = params.seerId
  if (!seerId) return { tokens }

  const seerCorrect = params.isCorrect[seerId] ?? false
  const followers = params.allPlayerIds.filter(
    (pid) => pid !== seerId && params.decisions[pid] === 'follow'
  )

  if (followers.length > 0) {
    // Seer earns influence from each player who followed them.
    tokens[seerId] = seerCorrect ? 2 : followers.length
  }

  for (const pid of params.allPlayerIds) {
    if (pid === seerId) continue
    if (params.decisions[pid] === 'follow') {
      // Followed the seer: rewarded only when the seer was right.
      if (seerCorrect) tokens[pid] = 2
    } else if (params.isCorrect[pid]) {
      // Went solo and got it right.
      tokens[pid] = 2
    }
  }

  return { tokens }
}
