const DB = require('origindb')('data');
const fs = require('fs').promises;
const path = require('path');


function addServer (guildID) {
	return new Promise((resolve, reject) => {
		fs.open(path.join('.', 'data', guildID)).then(() => {
			reject(new Error(`Server #${guildID} already exists`));
		}).catch(() => {
			const guild = DB(guildID);
			guild.set('id', guildID);
			guild.set('staffRole', false);
			guild.set('category', false);
			guild.set('archived', false);
			guild.set('prefix', null);
			guild.set('threads', []);
			guild.set('bans', []);
			guild.set('snippets', {});
			resolve(guild);
		});
	});
}

function getServer (guild, awaitStyle) {
	return new Promise((resolve, reject) => {
		if (typeof guild === 'object') return guild;
		fs.open(path.join('.', 'data', guild + '.json')).then(() => {
			resolve(DB(guild));
		}).catch(() => awaitStyle ? resolve(null) : reject(new Error(`Couldn't find the specified server.`)));
	});
}

function postThread (guildRef, content, message, author) {
	if (!author) author = message.author;
	return new Promise((resolve, reject) => {
		getServer(guildRef).then(async guild => {
			if (!guild.get('category') || !guild.get('staffRole')) {
				return reject(new Error(`Sorry, but this server hasn't finished setting up this Bot. Please contact the staff team.`));
			}
			if (Object.keys(guild.get('threads')).length >= 49) {
				return reject(new Error(`Apologies - this server already has 50 pending modmails. Please try again later!`));
			}
			if (guild.get('bans').includes(author.id)) {
				return reject(new Error(`You have been banned from creating modmails in this guild.`));
			}
			const server = client.guilds.cache.get(guild.get('id'));
			if (!server) return reject(new Error(`Something went wrong - I can't find the server!`));
			let parent = server.channels.cache.get(guild.get('category'));
			if (!parent) {
				parent = await server.channels.create('Modmails', { type: 'category' });
				guild.set('category', parent.id);
			}
			// return reject(new Error(`Something went wrong - the modmail channels category is missing!`));
			const serverAge = guild.get('restrict')?.server_age || 0;
			const userAge = guild.get('restrict')?.user_age || 0;
			if (serverAge && Date.now() - message.member.joinedAt < serverAge) {
				const time = Tools.toHumanTime(serverAge);
				return reject(new Error(`You must have spent at least ${time} on the server to create modmail!`));
			}
			if (userAge && Date.now() - author.createdAt < userAge) {
				return reject(new Error(`Your account must be at least ${Tools.toHumanTime(serverAge)} old to create modmail!`));
			}
			if (guild.get('threads')[author.id]) return reject(new Error('You already have an open modmail!'));
			server.channels.create(author.tag, {
				type: 'text',
				parent: parent,
				permissionOverwrites: [{
					id: guild.get('id'),
					deny: ['VIEW_CHANNEL']
				}, {
					id: guild.get('staffRole'),
					allow: ['VIEW_CHANNEL', 'MANAGE_MESSAGES', 'MANAGE_CHANNELS']
				}, {
					id: client.user.id,
					allow: ['VIEW_CHANNEL', 'MANAGE_MESSAGES', 'MANAGE_CHANNELS']
				}]
			}).then(channel => {
				const embed = new Embed();
				embed.setTitle(author.tag);
				embed.setColor(Colours.blurple);
				embed.addField('User', `<@!${author.id}>`);
				embed.addField('Tickets', `${guild.get('count')[author.id] || 0}`);
				if (author.id !== message.author.id) embed.addField('Posted by', `<@!${message.author.id}>`);
				embed.setFooter(`ID: ${author.id}`);
				embed.setTimestamp();
				channel.send(embed);
				const openEmbed = new Embed();
				openEmbed.setTitle(author.tag);
				openEmbed.setColor(Colours.blurple);
				openEmbed.addField('\u200b', content);
				openEmbed.setTimestamp();
				channel.send(openEmbed);
				guild.get('threads')[author.id] = {
					userID: author.id,
					channelID: channel.id,
					time: Date.now(),
					messages: [{ by: 'poster', content }]
				};
				if (!guild.get('count')[message.author.id]) guild.get('count')[author.id] = 0;
				guild.get('count')[author.id]++;
				DB.save();
				resolve();
			}).catch(err => {
				console.log(err);
				return reject(new Error(`Sorry, I don't have the permissions to function properly.`));
			});
		}).catch(reject);
	});
}

function replyToThread (reply, message, poster) {
	return new Promise((resolve, reject) => {
		getServer(poster || message.guild.id).then(guild => {
			const server = client.guilds.cache.get(poster || message.guild.id);
			const thread = poster
				? guild.get('threads')[message.author.id]
				: Object.values(guild.get('threads')).find(thread => thread.channelID = message.channel.id);
			if (!thread) return reject(new Error(`Unable to find the appropriate channel`));
			const embed = new Embed();
			embed.setColor(Colours.blurple);
			embed.addField('\u200b', reply);
			embed.addField('\u200b', `**By** <@!${message.author.id}>`);
			embed.setTimestamp();
			if (!poster) {
				embed.setFooter('Staff Reply');
				embed.setTitle('Modmail Reply');
				embed.setAuthor(server.name, server.iconURL());
			} else {
				embed.setTitle(message.author.tag);
			}
			(poster
				? client.channels.fetch(thread.channelID)
				: client.users.fetch(thread.userID)
			).then(channel => channel.send(embed)).then(() => {
				thread.messages.push({ by: poster ? false : message.author.id, content: reply });
				DB.save();
				resolve();
			}).catch(() => {
				reject('This modmail was manually deleted');
				// Delete thread from database?
			});
		}).catch(reject);
	});
}

function closeThread (reply, message, poster) {
	return new Promise((resolve, reject) => {
		getServer(poster || message.guild.id).then(guild => {
			const thread = poster
				? guild.get('threads')[message.author.id]
				: Object.values(guild.get('threads')).find(thread => thread.channelID = message.channel.id);
			if (!thread) return reject(new Error(`Unable to find the appropriate thread`));
			const embed = new Embed();
			embed.setColor(Colours.red);
			embed.setTitle('Ticket closed by ' + message.author.tag);
			if (reply) embed.addField('\u200b', reply);
			embed.setTimestamp();
			Promise.all([client.channels.cache.get(thread.channelID), client.users.cache.get(thread.userID)].map(channel => {
				return channel.send(embed);
			})).then(async () => {
				const threadChannel = client.channels.cache.get(thread.channelID);
				const guildObj = guild.object();
				delete guildObj.threads[thread.userID];
				thread.guildID = guild.get('id');
				if (poster) {
					for (let i = thread.posts.length - 1; i >= 0; i--) {
						const post = thread.posts[i];
						if (post.by) {
							thread.resolver = post.by;
							break;
						}
					}
					if (!thread.resolver) thread.resolver = false;
				} else thread.resolver = false;
				DB('logs').object().logs.push(thread);
				DB.save();
				if (!threadChannel) return resolve('No channel to archive');
				let archiveCat = client.channels.cache.get(guild.get('archived'));
				if (!archiveCat) {
					archiveCat = await client.guilds.cache.get(guild.get('id')).channels.create('Archived Modmails', {
						type: 'category',
						permissionOverwrites: [{
							id: guild.get('id'),
							deny: ['VIEW_CHANNEL']
						}, {
							id: guild.get('staffRole'),
							allow: ['VIEW_CHANNEL', 'MANAGE_MESSAGES', 'MANAGE_CHANNELS']
						}, {
							id: client.user.id,
							allow: ['VIEW_CHANNEL', 'MANAGE_MESSAGES', 'MANAGE_CHANNELS']
						}]
					});
					guild.set('archived', archiveCat.id);
				}
				threadChannel.setParent(archiveCat).then(() => {
					threadChannel.send('Modmail successfully archived').then(() => resolve());
				}).catch(err => {
					threadChannel.send('Unable to move channel to the archived category; please fix my permissions!');
				});
			});
		}).catch(reject);
	});
}

function save () {
	return DB.save();
}

module.exports = {
	addServer,
	getServer,
	postThread,
	replyToThread,
	closeThread,
	save
};