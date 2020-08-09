import { spawn } from "child_process"
import { config } from "dotenv";
import { Toolkit } from "actions-toolkit";
import { OutputType } from "actions-toolkit/lib/outputs";
import { InputType } from "actions-toolkit/lib/inputs";
import fs from "fs";
import http from "http";
import { Stats } from "./stats";
import * as core from "@actions/core";

config();

function exec(cmd: string, args: string[] = []): void {
    new Promise((resolve, reject) => {
        const app = spawn(cmd, args, { stdio: "inherit" });

        app.on("close", (code: number) => {
            if (code !== 0) {
                const err = new Error(`Invalid status code: ${code}`);

                return reject(err);
            }

            return resolve(code);
        });

        app.on("error", reject);
    });
}

async function commitFile() {
    await exec("git", [
        "config",
        "--global",
        "user.email",
        "nverblaz@gmail.com",
    ]);
    await exec("git", ["config", "--global", "user.name", "readme-bot"]);
    await exec("git", ["add", "README.md"]);
    await exec("git", ["commit", "-m", "Update README.md with Slippi stats"]);
    await exec("git", ["push"]);
}

const options: http.RequestOptions = {
    host: process.env.URL ? process.env.URL : core.getInput("URL"),
    // port: process.env.PORT ? process.env.PORT : core.getInput("PORT"),
    path: "/getLastMatchStats",
    method: 'GET',
    headers: {
        accept: 'application/json'
    }
};

console.log("Requesting...", options);

http.request(options, (response: http.IncomingMessage) => {
    let dataStr = "";

    response.on("data", (chunk) => {
        dataStr += chunk;
    });

    response.on("end", () => {
        try {
            const data = JSON.parse(dataStr);

            if (data.status == "error")
                throw new Error(data.error);

            const stats: Stats = data.stats;

            console.log(stats);

            updateReadme(stats);
        } catch (e) {
            console.error("Cannot parse response and update readme", e);
        }
    });
}).end();

function updateReadme(stats: Stats): void {
    Toolkit.run(
        async (tools: Toolkit<InputType, OutputType>) => {
            let readmeContent = fs.readFileSync("./README.md", "utf-8");

            if (!readmeContent.includes("<!--START_SECTION:slippi_stats-->") ||
                !readmeContent.includes("<!--END_SECTION:slippi_stats-->")
            ) return;

            const statsHtml = `
                <h1>Latest match stats:</h1>
                <p>
                    <span style="${stats.win ? "#5f5" : "#f55"}">${stats.win ? "WIN" : "LOSE"}</span>
                    <span>${stats.character.name} vs ${stats.opponentCharacter.name}</span>
                    <span>Stage: ${stats.stage}</span>
                    <span>Duration: ${stats.duration}</span>
                    <br>
                    <span>Stocks remaining: ${stats.stocksRemaining}</span>
                    <span>Avg. openings per kill: ${stats.openingsPerKill}</span>
                    <span>Avg. damage per opening: ${stats.damagePerOpening}%</span>
                    <span>Total damage: ${stats.totalDamage}%</span>
                    <span>Inputs per minute: ${stats.inputsPerMinute}</span>
                </p>
            `

            readmeContent = readmeContent.replace(/<!--START_SECTION:slippi_stats-->(.|[\r\n])*<!--END_SECTION:slippi_stats-->/gm,
                `<!--START_SECTION:slippi_stats-->
                                ${statsHtml}
                            <!--END_SECTION:slippi_stats-->
            `);

            fs.writeFileSync("./README.md", readmeContent);

            try {
                await commitFile();
            } catch (err) {
                tools.log.debug("Something went wrong");
                return tools.exit.failure(err);
            }

            tools.exit.success("Updated.");
        },
        {
            event: ["schedule", "workflow_dispatch"],
            secrets: ["GITHUB_TOKEN"],
        }
    )
}
