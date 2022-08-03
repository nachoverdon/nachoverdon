import { spawn, exec } from "child_process";

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function execCommand(cmd: string, args: string[] = []): Promise<number> {
  return new Promise((resolve, reject) => {
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

export async function execCommandWithResult(cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, _) => {
      if (error) {
        reject(error);
      }

      resolve(stdout);
    });
  });
}
