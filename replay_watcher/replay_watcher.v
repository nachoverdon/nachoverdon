import json
import time
import os { File }
import encoding.binary { big_endian_u32 }

struct Config {
	directory string
	url string
}

const (
	slp_ext = "slp"
	config_file_name = "config.json"
	sleep_time = 5 // 5 seconds
	endpoint = "processReplay"
)

fn main() {
	config_file := os.read_file(config_file_name) or {
		println("Cannot find config.json")
		return
	}
	cfg := json.decode(Config, config_file) or {
		println("Malformed config.json")
		return
	}
	mut slp_file := ""
	mut last_slp_file := ""

	println("Starting replay watcher...")

	for {
		slp_file = get_latest_slp_file(cfg.directory) or {
			println(err.msg())
			""
		}

		if slp_file != "" && slp_file != last_slp_file && os.exists(slp_file) {
			last_slp_file = slp_file
			watch_file(slp_file)
			post_replay(cfg.url + endpoint, slp_file)
		}

		println("Waiting ${sleep_time} seconds for new replays...")

		time.sleep(sleep_time * time.second)
	}
}

// Gets the latest .slp file from a directory recursively
fn get_latest_slp_file(directory string) ?string {
	if !os.exists(directory) || !os.is_dir(directory) {
		return error("Path doesn't exists or is not directory: ${directory}.")
	}

	slp_files := os.walk_ext(directory, slp_ext)
	mut latest_slp_file := ""
	mut latest_modified := i64(0)
	mut last_modified := i64(0)

	for file_name in slp_files {
		last_modified = os.file_last_mod_unix(file_name)

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
	println("Watching file $replay_path ...")

	mut file := os.open(replay_path) or {
		println("Cannot open file: $replay_path")
		return
	}
	defer { file.close() }

	for !is_replay_finished(file) {
		time.sleep(sleep_time * time.second)
	}

	println("Replay ended.")
}

// Read 4 bytes from the given file at the given position as a big endian u32
fn get_u32_at(file File, pos u64) u32 {
	return big_endian_u32(file.read_bytes_at(4, pos))
}

// Checks if the replays has finishied by looking at the raw data length
fn is_replay_finished(file File) bool {
	// 11 is the offset until the length of the raw data
	return get_u32_at(file, 11) != 0
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
