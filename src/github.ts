import fs from "fs";
import { Stats } from "./stats";
import { execCommand } from "./util";
import { join } from "path";
import { logger } from "./watcher";

const GH_REPO_PATH = process.env.GH_REPO_PATH!
const GH_CONFIG_NAME = process.env.GH_CONFIG_NAME!
const GH_CONFIG_MAIL = process.env.GH_CONFIG_MAIL!

async function commitFile() {
  try {
    await execCommand("git", ["config", "--local", "user.email", `${GH_CONFIG_NAME}@readmebot.com`]);
    await execCommand("git", ["config", "--local", "user.name", "readme-bot"]);
    await execCommand("git", ["add", join(GH_REPO_PATH, "README.md")]);
    await execCommand("git", ["commit", "-m", "Update README.md with Slippi stats"]);
    await execCommand("git", ["push"])
    await execCommand("git", ["pull"]);
  } catch (err) {
    logger.log("error","Couldn't perform a git command.");

    if (typeof err === "string") {
      logger.log("error", err);
    } else if (err instanceof Error) {
      logger.log("error", err.message);
    }
  }
  // Set original credentials back
  await execCommand("git", ["config", "--local", "user.email", GH_CONFIG_MAIL]);
  await execCommand("git", ["config", "--local", "user.name", GH_CONFIG_NAME]);
}

export async function updateReadme(stats: Stats): Promise<void> {
  let readmeContent = fs.readFileSync(join(GH_REPO_PATH, "README.md"), "utf-8");

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
<span>[bazoo] ${stats.character.name} vs ${stats.opponentCharacter.name} [opponent]</span>
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

  fs.writeFileSync(join(GH_REPO_PATH, "README.md"), readmeContent);

  try {
    await commitFile();
  } catch (err) {
    console.error("Something went wrong", err);
  }

}
