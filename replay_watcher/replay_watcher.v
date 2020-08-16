import json
import time
import os

struct Config {
	directory string
	url string
}

const (
	slp_ext = "slp"
	config_file_name = "config.json"
	sleep_time_ms = 5_000 // 5 seconds
	endpoint = "processReplay"
)

fn main() {
	config_file := os.read_file(config_file_name) or { return }
	cfg := json.decode(Config, config_file) or { return }
	mut slp_file := ""
	mut last_slp_file := ""

	println("Starting replay watcher...")

	for {
		slp_file = get_latest_slp_file(cfg) or {
			println(err)
			""
		}

		if slp_file != "" && slp_file != last_slp_file && os.exists(slp_file) {
			last_slp_file = slp_file
			watch_file(slp_file)
			post_replay(cfg.url + endpoint, slp_file)
		}

		println("Waiting ${sleep_time_ms / 1000} seconds for new replays...")

		time.sleep_ms(sleep_time_ms)
	}
}

// Gets the latest .slp file from a directory recursively
fn get_latest_slp_file(cfg Config) ?string {
	if !os.exists(cfg.directory) || !os.is_dir(cfg.directory) {
		return error("Not exists or is not dir $cfg.directory")
	}

	slp_files := os.walk_ext(cfg.directory, slp_ext)
	mut latest_slp_file := ""
	mut latest_modified := 0

	for file_name in slp_files {
		last_modified := os.file_last_mod_unix(file_name)

		if last_modified > latest_modified {
			latest_modified = last_modified
			latest_slp_file = file_name
		}
	}

	if latest_slp_file == "" {
		return error("No replay found.")
	}

	return latest_slp_file
}

// Checks the file every few seconds until the file hasn't been changed.
fn watch_file(replay_path string) {
	println("Watching file $replay_path")

	mut last_time_modified := 0
	mut time_modified := 0

	for {
		time_modified = os.file_last_mod_unix(replay_path)

		if last_time_modified == time_modified {
			break
		}

		last_time_modified = time_modified
		time.sleep_ms(sleep_time_ms)
	}

	println("Replay ended.")
}

// Makes a curl POST request to the server, sending the data from the replay
fn post_replay(url string, replay_path string) {
	println("Uploading replay...")

	result := os.exec('curl -k --location --request POST "$url" \
		--header "Content-Type: application/octet-stream" \
		--data-binary "@$replay_path"'
	) or {
		println("Unable to do POST request to $url: $err")
		return
	}

	println("Response returned with status code: $result.exit_code: $result.output")
}
