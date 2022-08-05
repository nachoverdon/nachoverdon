export type Stats = {
    win: boolean;
    character: Character;
    opponentCharacter: Character;
    opponentNameTag: string;
    stage: string;
    stocksRemaining: number;
    openingsPerKill: number;
    totalDamage: number;
    damagePerOpening: number;
    inputsPerMinute: number;
    duration: string;
}

export type Character = {
    name: string;
    id: number;
}
