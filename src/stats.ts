export type Stats = {
    win: boolean;
    character: Character;
    opponentCharacter: Character;
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
