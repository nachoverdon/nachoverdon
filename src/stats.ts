import { characters as SlippiCharacters, SlippiGame, stages as SlippiStages } from "@slippi/slippi-js";
import moment from "moment";

const SLIPPI_ACCOUNTS = process.env.SLIPPI_ACCOUNTS!.split(",");

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

function getPlayerIndex(game: SlippiGame): number {
    const players = game.getMetadata()!.players;

    for (const index in players) {
        // @ts-ignore
        const player: any = players[index];

        if (SLIPPI_ACCOUNTS.includes(player.names.code))
            return parseInt(index);
    }

    console.log(`Cannot find any account that matches ${SLIPPI_ACCOUNTS.join(", ")}`);

    return -1;
}

/**
 * -1 = Draw or unresolved
 * 0 = Player 1
 * 1 = Player 2
 *
 * @param game
 */
function getWinnerIndex(game: SlippiGame): number {
    const gameEnd = game.getGameEnd();

    if (!gameEnd)
        return -1;

    const gameEndMethod = gameEnd!.gameEndMethod;

    switch (gameEndMethod) {
        case 1: {
            const latestFrame = game.getLatestFrame();

            if (!latestFrame)
                return 0;

            const p1Percent = latestFrame.players[0]!.post.percent!;
            const p2Percent = latestFrame.players[1]!.post.percent!;

            if (p1Percent === p2Percent)
                return -1;
            else if (p1Percent > p2Percent)
                return 1;

            return 0;
        }
        case 2: {
            const latestFrame = game.getLatestFrame();

            if (!latestFrame)
                return -1;

            const p1StocksRemaining = latestFrame.players[0]!.post.stocksRemaining!;
            const p2StocksRemaining = latestFrame.players[1]!.post.stocksRemaining!;

            if (p1StocksRemaining === p2StocksRemaining)
                return -1;
            if (p1StocksRemaining > p2StocksRemaining)
                return 0;

            return 1;
        }
        case 7:
            if (gameEnd.lrasInitiatorIndex == 0)
                return 1;

            return 0;
        case 0:
        default:
            return -1;
    }
}

function getStats(game: SlippiGame, playerIndex: number): Stats {
    const win = getWinnerIndex(game) === playerIndex;
    const character = getCharacter(game, playerIndex);
    const opIndex = playerIndex === 0 ? 1 : 0;
    const opCharacter = getCharacter(game, opIndex);
    const opNametag = game.getMetadata()!.players![opIndex].names!.netplay ?? game.getMetadata()!.players![opIndex].names!.code!
    const stage = SlippiStages.getStageName(game.getSettings()!.stageId!);
    const stocksRemaining = game.getLatestFrame()!.players[playerIndex]!.post.stocksRemaining!;
    const stats = game.getStats()!;
    const overallStats = stats.overall[playerIndex];
    const openingsPerKill = overallStats.openingsPerKill.ratio ? overallStats.openingsPerKill.ratio : 0;
    const totalDamage = overallStats.totalDamage;
    const damagePerOpening = overallStats.damagePerOpening.ratio ? overallStats.damagePerOpening.ratio : 0;
    const inputsPerMinute = overallStats.inputsPerMinute.ratio ? overallStats.inputsPerMinute.ratio : 0;
    const duration = getDuration(stats.lastFrame);


    return {
        win: win,
        character: character,
        opponentCharacter: opCharacter,
        opponentNameTag: opNametag,
        stage: stage,
        stocksRemaining: stocksRemaining,
        openingsPerKill: openingsPerKill,
        totalDamage: totalDamage,
        damagePerOpening: damagePerOpening,
        inputsPerMinute: inputsPerMinute,
        duration: duration,
    }
}

function getCharacter(game: SlippiGame, playerIndex: number): Character {
    const characterId = game.getSettings()!.players[playerIndex].characterId!;
    const name = SlippiCharacters.getCharacterName(characterId);

    return {
        name: name,
        id: characterId,
    }
}

function getDuration(frames: number): string {
    const duration = moment.duration(frames / 60, 'seconds');

    return moment.utc(duration.as('milliseconds')).format('m:ss');
}

export function processReplay(replayPath: string): Stats | null {
    const game = new SlippiGame(replayPath);

    if (!game)
        throw new Error("Game is null.");

    const anyPlayerIsNotHuman = game.getSettings()!.players.find(player => {
        return player.type == 1 || player.type == 2 || player.type == 3;
    });

    if (anyPlayerIsNotHuman) {
        console.log("A player is not human.");

        return null;
    }

    const gameIsUnresolved = game.getGameEnd() && game.getGameEnd()?.gameEndMethod === 0;

    if (gameIsUnresolved) {
        console.log("Game is unresolved");

        return null;
    }

    // console.log(game.getSettings(), game.getMetadata(), game.getStats());
    // @ts-ignore
    const accountIndex = getPlayerIndex(game);

    if (accountIndex === -1) {
        console.log("Player not found. Get gud, kid.");

        return null;
    }

    // Ignore doubles games
    if (game.getSettings()!.players.length > 2) {
        console.log("Doubles are not supported.");

        return null;
    }

    return getStats(game, accountIndex);
}
