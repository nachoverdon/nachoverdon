import { config } from "dotenv"
import express, { Request, Response } from "express";
import {
    SlippiGame,
    characters as SlippiCharacters,
    stages as SlippiStages
} from "@slippi/slippi-js";
import { Character, Stats } from "./stats";
import moment from "moment";

config();

const SLIPPI_ACCOUNTS = process.env.SLIPPI_ACCOUNTS!.split(",");
const app = express();
const port = process.env.PORT;
let lastStats: Stats | undefined;

app.get("/", (_request: Request, response: Response) => {
    response.send("Visit my GitHub at: https://github.com/nachoverdon");
});
app.get("/getLastMatchStats", getLastMatchStats);
app.post("/processReplay", processReplay);
app.listen(port, () => console.log(`Listening on port ${port}`));

function getLastMatchStats(_request: Request, response: Response): void {
    if (!lastStats) {
        sendError(response, "No stats available yet.");

        return;
    }

    response.json({
        status: "OK",
        stats: lastStats,
    });
}

function processReplay(request: Request, response: Response): void {
    try {
        let buffer = Buffer.alloc(0);

        request.on('data', function(chunk) {
            buffer = Buffer.concat([buffer, chunk]);
        });

        request.on('end', function() {
            const game = new SlippiGame(buffer);

            if (!game)
                throw new Error("Game is null.");

            const anyPlayerIsNotHuman = game.getSettings().players.find(player => {
                return player.type == 0 || player.type == 1 || player.type || 2
            });

            if (anyPlayerIsNotHuman) {
                sendError(response, "A player is not human.");

                return;
            }

            const gameIsUnresolved = game.getGameEnd() && game.getGameEnd()?.gameEndMethod === 0;

            if (gameIsUnresolved) {
                sendError(response, "Game is unresolved");

                return;
            }

            // console.log(game.getSettings(), game.getMetadata(), game.getStats());
            // @ts-ignore
            const accountIndex = getPlayerIndex(game);

            if (accountIndex === -1) {
                sendError(response, "Player not found. Get gud, kid.");

                return;
            }

            lastStats = getStats(game, accountIndex);

            response.json({
                status: "OK",
            });
        });
    } catch (e) {
        const errorMessage = "Unable to process game."

        console.error(errorMessage, e);
        sendError(response, errorMessage);
    }
}

function getPlayerIndex(game: SlippiGame): number {
    const players = game.getMetadata().players;

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
        case 1:
            const p1Percent = game.getLatestFrame()?.players[0].post.percent!;
            const p2Percent = game.getLatestFrame()?.players[1].post.percent!;

            if (p1Percent === p2Percent)
                return -1;
            else if (p1Percent > p2Percent)
                return 1;

            return 0
        case 2:
            const p1StocksRemaining = game.getLatestFrame()?.players[0].post.stocksRemaining!;
            const p2StocksRemaining = game.getLatestFrame()?.players[1].post.stocksRemaining!;

            if (p1StocksRemaining === p2StocksRemaining)
                return -1;
            if (p1StocksRemaining > p2StocksRemaining)
                return 0

            return 1;
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
    const stage = SlippiStages.getStageName(game.getSettings().stageId!);
    const stocksRemaining = game.getLatestFrame()!.players[playerIndex].post.stocksRemaining!;
    const stats = game.getStats();
    const overallStats = stats.overall[playerIndex];
    const openingsPerKill = overallStats.openingsPerKill.ratio!;
    const totalDamage = overallStats.totalDamage;
    const damagePerOpening = overallStats.damagePerOpening.ratio!;
    const inputsPerMinute = overallStats.inputsPerMinute.ratio!;
    const duration = getDuration(stats.lastFrame);


    return {
        win: win,
        character: character,
        opponentCharacter: opCharacter,
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
    const characterId = game.getSettings().players[playerIndex].characterId!;
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

function sendError(res: Response, err: string): void {
    res.json({
        status: "error",
        error: err,
    });
}
