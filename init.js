const fs = require('fs');
const path = require('path');

module.exports = function initialize () {
	try {
		require('./config.js');
	} catch {
		console.log('config.js does not exist. Creating one with default options...');
		const DEFAULT_TOKEN = null;
		const configText = `module.exports = {\n` +
			`\tadmins: ['333219724890603520', '768863119568928818'],\n` +
			`\tprefix: 'm!',\n\ttoken: "${DEFAULT_TOKEN || 'token here'}"\n};`;
		fs.writeFileSync(path.join('.', 'config.js'), configText);
		if (!DEFAULT_TOKEN) {
			console.log(`No default token found. Please manually add a token to the config.js file`);
			process.exit(-1);
		}
	}
	return console.log('Loaded config.');
};