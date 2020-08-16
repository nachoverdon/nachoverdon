import os

const (
	slp_ext = "slp"
)

fn main() {
	directory := os.args[1]
	latest := get_latest_slp_file(directory) or {
		err
	}

	print(latest)
}

fn get_latest_slp_file(directory string) ?string {
	if !os.exists(directory) || !os.is_dir(directory) {
		return error("[ERROR] Path doesn't exists or is not directory: ${directory}.")
	}

	slp_files := os.walk_ext(directory, slp_ext)
	mut latest_slp_file := ""
	mut latest_modified := 0
	mut last_modified := 0

	for file_name in slp_files {
		last_modified = os.file_last_mod_unix(file_name)

		if last_modified > latest_modified {
			latest_modified = last_modified
			latest_slp_file = file_name
		}
	}

	if latest_slp_file == "" {
		return error("[ERROR] No replay found.")
	}

	return latest_slp_file
}