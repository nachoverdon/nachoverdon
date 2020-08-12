import { spawn } from "child_process"
import { config } from "dotenv";
import { Toolkit } from "actions-toolkit";
import { OutputType } from "actions-toolkit/lib/outputs";
import { InputType } from "actions-toolkit/lib/inputs";
import fs from "fs";
import https from "https";
import { Stats } from "./stats";
// import { getInput } from "@actions/core";

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
        "readmebot@nachoverdon.com",
    ]);
    await exec("git", ["config", "--global", "user.name", "readme-bot"]);
    await exec("git", ["add", "README.md"]);
    await exec("git", ["commit", "-m", "Update README.md with Slippi stats"]);
    await exec("git", ["push"]);
}

const options: https.RequestOptions = {
    host: "nachoverdon.herokuapp.com",
    path: "/getLastMatchStats",
    method: 'GET',
    headers: {
        accept: 'application/json'
    }
};

console.log("Requesting...", options);

https.request(options, (response) => {
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

            const statsHtml =
`
<div>
<h1>Latest match stats:</h1>
<p>
<span style="color: ${stats.win ? "#5f5" : "#f55"};">${stats.win ? "WIN" : "LOSE"}</span>
<br>
<span>${stats.character.name} vs ${stats.opponentCharacter.name}</span>
<br>
<span>Stage: ${stats.stage}</span>
<br>
<span>Duration: ${stats.duration}</span>
<br>
<br>
${stats.win ? `<span>Stocks remaining: ${stats.stocksRemaining}</span><br>` : ""}
<span>Avg. openings per kill: ${stats.openingsPerKill.toFixed(1)}</span>
<br>
<span>Avg. damage per opening: ${stats.damagePerOpening.toFixed(1)}%</span>
<br>
<span>Total damage: ${stats.totalDamage.toFixed(1)}%</span>
<br>
<span>Inputs per minute: ${stats.inputsPerMinute.toFixed(1)}</span>
<br>
</p>
</div>
`

            readmeContent = readmeContent.replace(/<!--START_SECTION:slippi_stats-->(.|[\r\n])*<!--END_SECTION:slippi_stats-->/gm,
                `<!--START_SECTION:slippi_stats-->${statsHtml}<!--END_SECTION:slippi_stats-->`);

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
