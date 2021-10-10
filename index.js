global.Discord = require('discord.js');
const fs = require('fs').promises;
const path = require('path');

const init = require('./init.js');
init();

global.config = require('./config.js');
global.Colours = require('./colours.json');
global.client = new Discord.Client({
	fetchAllMembers: true,
	ws: [Discord.Intents.GUILD_MEMBERS, Discord.Intents.FLAGS.GUILD_MESSAGE_REACTIONS]
});
global.Database = require('./database.js');
global.Embed = Discord.MessageEmbed;
global.Tools = require('./tools.js');

client.on('message', require('./handler.js'));
client.login(config.token, err => console.log(err));
client.once("ready", () => {
	console.log(`Connected to Discord.`);
	client.user.setActivity("Mailing!");
});
client.on("guildCreate", guild => {
	// check if guild is already stored #TODO
	const embed = new Embed();
	embed.setColor(Colours.blurple);
	embed.setTitle("Radon Modmail");
	embed.addFields({
		name: 'About Me',
		value: `I'm Radon Modmail, a modmailing Bot! To get started, type ${config.prefix}!`
	}, {
		name: 'Support',
		value: "You can find support at my support server: https://dsc.gg/modmailer"
	});
	guild.fetchAuditLogs({ type: "BOT_ADD", limit: 1 }).then(log => {
		log.entries.first().executor.send(embeds).catch(e => console.error(e));
	}).catch(() => {
		const self = guild.members.cache.find(user => user.id === client.user.id);
		let outChannel;
		guild.channels.cache.forEach(channel => {
			if (channel.type !== 'text' || channel.deleted) return;
			if (channel.permissionsFor(self).has(['VIEW_CHANNEL', 'SEND_MESSAGES'], true)) {
				if (channel.rawPosition < outChannel.rawPosition) outChannel = channel;
			}
		});
		channel?.send(embed);
	}).finally(() => {
		Database.addServer(guild.id).catch(() => {
			// Run basic checks to see if the old modmail categories are still available
		});
	});
});