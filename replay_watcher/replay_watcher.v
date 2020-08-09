import json
import time
import net.http

struct Config {
	directory string
	url string
}

const (
	slp_ext = "slp"
	config_file_name = "config.json"
	sleep_time = 20000 // 20 seconds
	endpoint = "processReplay"
)

fn main() {
	config_file := read_file(config_file_name) or { return }
	cfg := json.decode(Config, config_file) or { return }

	for {
		latest_slp_file := get_latest_slp_file(cfg) or {
			println(err)
			return
		}

		post_replay(cfg.url, latest_slp_file)

		println("Last game was ${latest_slp_file}. Sleeping for ${sleep_time / 1000} seconds.")

		time.sleep_ms(sleep_time)
	}
}

fn get_latest_slp_file(cfg Config) ?string {
	if !exists(cfg.directory) || !is_dir(cfg.directory) {
		return error("Not exists or is not dir $cfg.directory")
	}

	if is_dir_empty(cfg.directory) {
		return error("Directory is empty.")
	}

	slp_files := walk_ext(cfg.directory, slp_ext)

	mut latest_slp_file := ""
	mut latest_modified := 0

	for file_name in slp_files {
		last_modified := file_last_mod_unix(file_name)

		if last_modified > latest_modified {
			latest_modified = last_modified
			latest_slp_file = file_name
		}
	}

	return latest_slp_file
}

fn post_replay(url string, replay_path string) {
	replay_data := read_file(replay_path) or {
		println("Unable to read data from file $replay_path")
		return
	}

	response := http.fetch(url + endpoint, {
		method: .post
		data: replay_data,
		headers: {
			"Content-Type": "application/octet-stream"
		}
	}) or {
		println("Unable to do POST request to $url$endpoint: $err")
		return
	}

	println("Response returned with status code: $response.status_code: $response.text")
}