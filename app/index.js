"use strict";

let settings = {
	GIFs:     true,
	Stickers: true,
};

let apiResults = new Map;
let previews = null;
let columns = null;
let lastScroll = null;

const input = document.querySelector("input[type=\"search\"]");
const previewContainer = document.querySelector(".preview-container");
const settingsButton = document.querySelector(".settings");

function resetPreviews() {
	if (previews)
		previews.forEach(preview => preview.hide());

	previews = [];
	columns = {
		right: 24,
		left:  24,
	};
	lastScroll = 0;
}

let adding = false;
function addPreviews() {
	if (adding)
		return;

	adding = true;

	let results = Array.from(apiResults.keys());
	let counter = Array(apiResults.size).fill(0);
	let maximum = Array(apiResults.size).fill(API.limit);

	(() => {
		results.forEach((result, i) => {
			if (counter[i] >= maximum[i])
				return;

			let data = apiResults.get(result);
			if (!data || !data.length)
				return;

			maximum[i] = data.length;

			let side = null;
			let offset = null;
			if (columns.right < columns.left) {
				side = Preview.Side.Right;
				offset = columns.right++;
			} else {
				side = Preview.Side.Left;
				offset = columns.left++;
			}

			let preview = new Preview(data[counter[i]++]);
			preview.show(previewContainer, offset, side);

			switch (side) {
			case Preview.Side.Right:
				columns.right += preview.height;
				break;
			case Preview.Side.Left:
				columns.left += preview.height;
				break;
			}

			previews.push(preview);
		});

		if (Array.from(apiResults.values()).some(data => data && data.length) && counter.some((item, i) => item < maximum[i]))
			return true;

		previewContainer.classList.toggle("empty", !previews.length);
		adding = false;
		return false;
	}).loop();
}

function getAPIResults() {
	apiResults.clear();

	let type = API.Trending;
	let parameters = {};

	let query = input.value.trim();
	if (query.length) {
		type = API.Search;
		parameters.q = query;
	}

	let promises = Object.keys(type)
	.map(key => {
		if (!settings[key] || !settings[key].checked)
			return;

		let result = new API.Result(type[key], parameters);
		apiResults.set(result, null);
		return result.next();
	})
	.filter(item => !!item);

	Promise.race(promises)
	.then(() => {
		resetPreviews();
		previewContainer.scrollTop = 0;

		promises.forEach(promise => {
			promise
			.then(({result, data}) => {
				apiResults.set(result, data);
				addPreviews();
			});
		});
	});
}

window.addEventListener("click", event => {
	input.focus();
});

window.addEventListener("focus", event => {
	Array.from(apiResults.keys()).forEach(result => {
		apiResults.set(result, result.data);
	});

	addPreviews();

	input.focus();
});

window.addEventListener("blur", event => {
	resetPreviews();
});

document.addEventListener("keydown", event => {
	if (event.keyCode === 27) { // Escape
		event.preventDefault();
		Electron.ipcRenderer.send("hide-browser", true);
	}
});

input.addEventListener("input", event => {
	if (event.metaKey || event.altKey)
		return;

	getAPIResults.debounce(500)();
});

previewContainer.addEventListener("scroll", event => {
	if (previewContainer.scrollTop - lastScroll < (previewContainer.scrollHeight - lastScroll) / 2)
		return;

	lastScroll = previewContainer.scrollHeight;

	for (let result of apiResults.keys()) {
		result.next()
		.then(({data}) => {
			apiResults.set(result, data);
			addPreviews();
		});
	}
});

let settingsMenu = new Electron.remote.Menu();
Object.keys(settings).forEach((key, i, keys) => {
	let menuItem = new Electron.remote.MenuItem({
		label: key,
		type: "checkbox",
		checked: settings[key],
		click() {
			if (keys.every(item => !settings[item].checked))
				settings[keys.find(item => item !== key)].checked = true;

			getAPIResults();
		},
	});
	settingsMenu.append(menuItem);

	settings[key] = menuItem;
});
settingsMenu.append(new Electron.remote.MenuItem({
	type: "separator",
}));
settingsMenu.append(new Electron.remote.MenuItem({
	role: "quit",
}));

settingsButton.addEventListener("click", event => {
	settingsMenu.popup(Electron.remote.getCurrentWindow());
});

getAPIResults();

input.focus();
