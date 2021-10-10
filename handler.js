module.exports = async function handler (message) {
	if (message.author.bot) return;
	const prefix = message.channel.type !== 'dm'
		? (await Database.getServer(message.guild.id, true))?.get('prefix') || config.prefix
		: config.prefix;
	if (new RegExp(`<@!?${client.user.id}>`).test(message.content)) {
		message.channel.send(`Hi, I'm Modmailer - a Bot with my own modmailing system! `
			+ `My prefix in this server is \`\u200b${prefix}\u200b\`.`
			+ `\nFor further information, type \`\`${prefix}help\`\`, `
			+ `or check out my support server at https://dsc.gg/modmailer`);
	}
	if (!message.content.startsWith(prefix)) {
		if (message.channel.type !== 'dm') return;
		message.content = `${prefix}create ${message.content}`;
	}
	const errify = text => message.channel.send(text).then(msg => msg.delete({ timeout: 3000 }));
	const content = message.content.substr(prefix.length);
	const args = content.split(/ +/), command = args.shift().toLowerCase();
	const canMod = message.member?.permissions.has(Discord.Permissions.MANAGE_GUILD);
	const checkPerms = async (silent) => {
		if (canMod) return true;
		const guildID = (await Database.getServer(message.guild?.id))?.get('staffRole');
		if (guildID && message.member?.roles.cache.get(guildID)) return true;
		const errMessage = canMod === null ? 'be a guild.' : 'have MANAGE_GUILD / staff permissions.';
		if (!silent) errify(`Access denied - must ${errMessage}`);
	};
	// Since commands are fairly limited and not really going to be very large / expandable
	// I'll just use a switch-case
	async function commandHandler (command, args, ext) {
		switch (command) {
			case 'eval': {
				if (!config.admins.includes(message.author.id)) return;
				let output;
				try {
					const evalContent = args.join(' ');
					output = require('util').inspect(eval(evalContent));
					console.log(output);
				} catch (e) {
					output = require('util').inspect(e);
					console.log(e);
				} finally {
					const outputArr = output.match(/(?:.|\n){1,1800}/gm);
					outputArr.slice(0, 5).forEach(o => message.channel.send(`\`\`\`\n${o}\n\`\`\``));
				}
				break;
			}
			case 'help': {
				const embed = new Embed();
				embed.setColor(Colours.blurple);
				embed.setTitle("Radon Modmail Help");
				embed.setAuthor(message.guild.name, message.guild.iconURL());
				const helpFields = {
					help: {
						shortDesc: "Displays this message",
						desc: "Displays the help message."
						+ "If a specific command is specified, will show all details about that command.",
						perms: false,
						example: `${prefix}help set`
					},
					set: {
						shortDesc: "Configures a server's settings",
						desc: "Used to set a server's settings. Syntax: "
						+ `\`\`${prefix}set setting1 = value1, setting2 = value2, ...\`\`. `
						+ "Once you're done setting up the minimum required settings, Radon Modmail will be usable. ",
						perms: true,
						extraFields: [{
							name: "Valid Settings",
							value: "Minimum Account Age, Minimum Server Age, Server Prefix, Staff Role (required)"
						}],
						example: `${prefix}set Staff Role = Moderator`
					},
					settings: {
						shortDesc: "Displays server settings",
						desc: "Displays the settings configured in your server. The minimum requirement for this Bot to function is "
						+ "for the Staff role to have been configured.",
						perms: true,
						example: `${prefix}settings`
					},
					reply: {
						shortDesc: "Replies to a modmail",
						desc: "Responds to a modmail if used in the appropriate channel. Replies may be up to 1000 characters long.",
						perms: true,
						example: `${prefix}reply Hi, we've looked at your issue!`
					},
					close: {
						shortDesc: "Closes a modmail",
						desc: "Closes a modmail if used in the appropriate channel. "
						+ "The closing message may be up to 1000 characters long. "
						+ "Also moves the modmail to the archived category, where staff can freely delete it.",
						perms: true,
						example: `${prefix}close Glad to be of help!`
					}
				};
				const givenCommand = args.join('').toLowerCase().replace(/[^a-z0-9]/g, '');
				if (givenCommand) {
					if (!helpFields.hasOwnProperty(givenCommand)) {
						embed.addField(`Invalid command`, `The command '${givenCommand}' does not exist.`);
					} else {
						const field = helpFields[givenCommand];
						if (field.perms && !(await checkPerms(true))) embed.addField('Error', 'Access denied!');
						else {
							embed.addFields([{
								name: givenCommand,
								value: '\u200b'
							}, {
								name: 'Description',
								value: field.desc
							}, ...(field.extraFields || []), {
								name: 'Example',
								value: field.example
							}]);
							if (field.perms) embed.addField('\u200b', 'This command may only be used by staff.');
						}
					}
				} else {
					const hasPerms = await checkPerms(true);
					Object.entries(helpFields).forEach(([label, field]) => {
						if (field.perms && !hasPerms) return;
						embed.addField(label, field.shortDesc);
					});
				}
				embed.setFooter(`Use \`${prefix}help (command)\` for detailed instructions about a command.`);
				embed.setTimestamp();
				if (ext) return embed;
				else message.channel.send(embed);
				break;
			}
			case 'set': {
				// Modifies settings
				if (!(await checkPerms())) return;
				function alias (key) {
					key = key.toLowerCase().replace(/[^a-z0-9]/g, '');
					const aliases = {
						minimumage: 'minage',
						minuserage: 'minage',
						minimumuserage: 'minage',
						minaccountage: 'minage',
						minimumaccountage: 'minage',
						age: 'minage',
						userage: 'minage',
						accountage: 'minage',
						minguildage: 'minserverage',
						minimumserverage: 'minserverage',
						minimumguildage: 'minserverage',
						minmemberage: 'minserverage',
						minimummemberage: 'minserverage',
						serverage: 'minserverage',
						guildage: 'minserverage',
						servertime: 'minserverage',
						minservertime: 'minserverage',
						minimumservertime: 'minserverage',
						staff: 'staffrole',
						mod: 'staffrole',
						modrole: 'staffrole',
						role: 'staffrole',
						serverprefix: 'prefix',
						guildprefix: 'prefix'
					};
					return aliases[key] || key;
				}
				const valids = {
					minage: val => Tools.fromHumanTime(val) + 1,
					minserverage: val => Tools.fromHumanTime(val) + 1,
					prefix: val => val !== "`" && val.length,
					staffrole: val => /^<@&\d{18}>$/.test(val) || message.guild.roles.cache.find(r => r.name === val)
				};
				const values = args.join(' ').split(/\s*(?<!\\),\s*/).map(line => line.split(/(?<!\\)=/).map(t => t.trim()));
				if (values.join('').length === 0) return help(message.channel, 'set');
				let nonPair = values.find(arr => {
					if (arr.length !== 2) return true;
					arr[0] = alias(arr[0]);
					arr[1] = arr[1].replace(/\\/g, '');
				});
				if (nonPair) return message.channel.send(`Found ${nonPair.length} term(s) in ${nonPair.join(' = ')}`);
				let invalid = values.find(([key, value]) => !value || !valids[key]?.(value));
				if (invalid) return message.channel.send(`Error parsing term: ${invalid.join(' = ')}`);
				let guildRef;
				Database.getServer(message.guild.id).then(guild => {
					guildRef = guild;
					let outs = [];
					return new Promise((resolve, reject) => {
						values.forEach(([key, value]) => {
							switch (key) {
								case 'minage': case 'minserverage': {
									const val = Tools.fromHumanTime(value);
									guild.object().restrict[{ minage: 'user_age', minserverage: 'server_age' }[key]] = val;
									const labels = { minage: 'Minimum Account Age', minserverage: 'Minimum Server Age' };
									outs.push([labels[key], Tools.toHumanTime(val)]);
									break;
								}
								case 'prefix': {
									if (value === 'default') value = null;
									guild.set('prefix', value);
									outs.push(['Server Prefix', value || config.prefix]);
									break;
								}
								case 'staffrole': {
									if (/^<@&\d{18}>$/.test(value)) value = value.slice(3, -1);
									else value = message.guild.members.cache.find(role => role.name === value);
									guild.set('staffRole', value);
									outs.push(['Staff Role', `<@&${value}>`]);
									break;
								}
							}
						});
						resolve(outs);
					});
				}).then(outs => {
					const embed = new Embed();
					embed.setColor(Colours.blurple);
					embed.setTitle('New settings');
					embed.setAuthor(message.guild.name, message.guild.iconURL());
					embed.addFields(outs.map(([name, value]) => {
						return { name, value };
					}));
					embed.setTimestamp();
					return message.channel.send(embed);
				}).then(() => {
					const guild = guildRef;
					if (guild.get('category') && guild.get('archived')) return;
					if (guild.get('staffRole')) {
						// set up
						message.channel.send('Creating the modmail and modmail archive categories...');
						const categs = ['Modmails', 'Modmail Archives'];
						if (guild.get('category')) categs.shift();
						if (guild.get('archived')) categs.pop();
						Promise.all(categs.map(name => {
							return message.guild.channels.create(name, {
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
						})).then(([modmails, archives]) => {
							guild.set('category', modmails.id);
							guild.set('archived', archives.id);
							message.channel.send(`You're completely set up! `
								+ `For further assistance, visit us at our Support Server: https://dsc.gg/modmailer`);
						}).catch(() => {
							message.author.send(`Hi, it appears I haven't been given permissions to create channels.`);
						});
					}
				}).catch(console.log);
				break;
			}
			case 'settings': {
				// Displays current server settings
				if (!(await checkPerms())) return;
				Database.getServer(message.guild.id).then(guild => {
					const inputFields = [['Staff Role', `<@&${guild.get('staffRole')}>`]];
					const guildPrefix = guild.get('prefix');
					if (guildPrefix) inputFields.unshift(['Prefix', guildPrefix]);
					const minage = guild.get('restrict').user_age;
					const minserverage = guild.get('restrict').server_age;
					if (minage) inputFields.push(['Minimum Account Age', Tools.toHumanTime(minage)]);
					if (minserverage) inputFields.push(['Minimum Server Time', Tools.toHumanTime(minserverage)]);
					const fields = inputFields.map(([name, value]) => {
						return { name, value };
					});
					const embed = new Embed();
					embed.setTitle('Server Settings');
					embed.setAuthor(message.guild.name, message.guild.iconURL());
					embed.setColor(Colours.blurple);
					embed.setTimestamp();
					embed.addFields(fields);
					message.channel.send(embed);
				});
				break;
			}
			case 'create': {
				// Hidden command that creates / replies to threads from DMs
				if (message.channel.type !== 'dm') return errify(`This command must be used in DMs.`);
				if (message.author.isMailing) return message.author.isMailing(args.join(' '));
				message.channel.send(`Please select a server: (you can use reactions, or simply post the server name / ID / index)`);
				const emotes = [
					"\u{30}\u{fe0f}\u{20e3}",
					"\u{31}\u{fe0f}\u{20e3}",
					"\u{32}\u{fe0f}\u{20e3}",
					"\u{33}\u{fe0f}\u{20e3}",
					"\u{34}\u{fe0f}\u{20e3}",
					"\u{35}\u{fe0f}\u{20e3}",
					"\u{36}\u{fe0f}\u{20e3}",
					"\u{37}\u{fe0f}\u{20e3}",
					"\u{38}\u{fe0f}\u{20e3}",
					"\u{39}\u{fe0f}\u{20e3}",
					"\u{1f51f}"
				];
				const commonGuilds = [...client.guilds.cache.filter(guild => guild.members.cache.has(message.author.id)).values()];
				function generateEmbed (start) {
					const thisList = commonGuilds.slice(start, start + 10);
					const embed = new Embed();
					embed.setColor(Colours.blurple);
					embed.setTitle('Select Guild (React accordingly)');
					embed.setFooter(`Page ${Math.round(start / 10 + 1)} of ${Math.ceil(commonGuilds.length / 10)}`);
					embed.addFields(thisList.map((term, i) => {
						return { name: '\u200b', value: `#${start + i + 1} (${emotes[i + 1]}) ${term.name}` };
					}));
					embed.setTimestamp();
					return embed;
				}
				const pages = [];
				new Promise(async (resolve, reject) => {
					message.author.isMailing = function (content) {
						// Takes context to allow us to use text inputs in addition to reactions
						const intVer = parseInt(content.trim().replace(/^#/, ''));
						if (intVer > 100) {
							// server ID
							const guildByID = client.guilds.cache.get(String(intVer));
							if (guildByID && guildById.members.cache[message.author.id]) {
								resolve(guildByID);
								return true;
							}
							else message.channel.send(`Invalid guild ID.`);
						} else if (intVer <= 100 && intVer > 0) {
							// server index
							const guildByIndex = commonGuilds[intVer - 1];
							if (guildByIndex) {
								resolve(guildByIndex);
								return true;
							}
							else message.channel.send(`Invalid guild index.`);
						} else {
							// server name
							const guildByName = commonGuilds.find(guild => guild.name === content);
							if (guildByName) {
								resolve(guildByName);
								return true;
							}
							else message.channel.send(`Couldn't find a guild by that name.`);
						}
						return false;
					};
					for (let i = 0; i < commonGuilds.length; i += 10) {
						const msg = await message.channel.send(generateEmbed(i));
						const j = i;
						/*(async () => {
							for (let k = 1; k <= 10 && j * 10 + k <= commonGuilds.length; k++) await msg.react(emotes[k]);
						})();*/
						const collector = msg.createReactionCollector((reaction, reacter) => {
							if (reacter.id !== message.author.id) return false;
							const emote = reaction.emoji.name;
							if (!emotes.includes(emote)) return false;
							if (j + emotes.indexOf(emote) > commonGuilds.length) return false;
							return true;
						}, { time: 60000 });
						collector.on('collect', reaction => {
							const emote = reaction.emoji.name;
							resolve(commonGuilds[j + emotes.indexOf(emote) - 1]);
						});
						pages.push(collector);
					}
				}).then(server => {
					delete message.author.isMailing;
					pages.forEach(collector => collector.stop());
					Database.getServer(server.id).then(guild => {
						if (guild.get('threads')[message.author.id]) {
							message.channel.send(`Replying to your modmail in ${server.name}...`).then(() => {
								Database.replyToThread(args.join(' '), message, server.id).then(() => {
									message.channel.send('Your response was successfully delivered.');
								}).catch(err => {
									console.log(err);
									message.channel.send(err.message);
								});
							});
						} else {
							message.channel.send(`Creating a modmail in ${server.name}...`).then(() => {
								Database.postThread(server.id, args.join(' '), message, message.author).then(() => {
									message.channel.send('Your modmail was successfully created!');
								}).catch(err => {
									console.log(err);
									message.channel.send(err.message);
								});
							});
						}
					}).catch(err => {
						console.log(err);
						message.channel.send(err.message);
					});
				}).catch(err => {
					console.log(err);
					message.channel.send(err.message);
				});
				break;
			}
			case 'reply': {
				// Replies to a ticket
				if (message.channel.type === 'dm') {
					if (message.author.isMailing) return message.author.isMailing(args.join(' '));
					message.channel.send(`Please select a server: `
						+ `(you can use reactions, or simply post the server name / ID / index)`);
					const emotes = [
						"\u{30}\u{fe0f}\u{20e3}",
						"\u{31}\u{fe0f}\u{20e3}",
						"\u{32}\u{fe0f}\u{20e3}",
						"\u{33}\u{fe0f}\u{20e3}",
						"\u{34}\u{fe0f}\u{20e3}",
						"\u{35}\u{fe0f}\u{20e3}",
						"\u{36}\u{fe0f}\u{20e3}",
						"\u{37}\u{fe0f}\u{20e3}",
						"\u{38}\u{fe0f}\u{20e3}",
						"\u{39}\u{fe0f}\u{20e3}",
						"\u{1f51f}"
					];
					const commonGuilds = [...client.guilds.cache.filter(guild => guild.members.cache.has(message.author.id)).values()];
					function generateEmbed (start) {
						const thisList = commonGuilds.slice(start, start + 10);
						const embed = new Embed();
						embed.setColor(Colours.blurple);
						embed.setTitle('Select Guild (React accordingly)');
						embed.setFooter(`Page ${Math.round(start / 10 + 1)} of ${Math.ceil(commonGuilds.length / 10)}`);
						embed.addFields(thisList.map((term, i) => {
							return { name: '\u200b', value: `#${start + i + 1} (${emotes[i + 1]}) ${term.name}` };
						}));
						embed.setTimestamp();
						return embed;
					}
					const pages = [];
					new Promise(async (resolve, reject) => {
						message.author.isMailing = function (content) {
							// Takes context to allow us to use text inputs in addition to reactions
							const intVer = parseInt(content.trim().replace(/^#/, ''));
							if (intVer > 100) {
								// server ID
								const guildByID = client.guilds.cache.get(String(intVer));
								if (guildByID && guildById.members.cache[message.author.id]) {
									resolve(guildByID);
									return true;
								}
								else message.channel.send(`Invalid guild ID.`);
							} else if (intVer <= 100 && intVer > 0) {
								// server index
								const guildByIndex = commonGuilds[intVer - 1];
								if (guildByIndex) {
									resolve(guildByIndex);
									return true;
								}
								else message.channel.send(`Invalid guild index.`);
							} else {
								// server name
								const guildByName = commonGuilds.find(guild => guild.name === content);
								if (guildByName) {
									resolve(guildByName);
									return true;
								}
								else message.channel.send(`Couldn't find a guild by that name.`);
							}
							return false;
						};
						for (let i = 0; i < commonGuilds.length; i += 10) {
							const msg = await message.channel.send(generateEmbed(i));
							const j = i;
							/*(async () => {
								for (let k = 1; k <= 10 && j * 10 + k <= commonGuilds.length; k++) await msg.react(emotes[k]);
							})();*/
							const collector = msg.createReactionCollector((reaction, reacter) => {
								if (reacter.id !== message.author.id) return false;
								const emote = reaction.emoji.name;
								if (!emotes.includes(emote)) return false;
								if (j + emotes.indexOf(emote) > commonGuilds.length) return false;
								return true;
							}, { time: 60000 });
							collector.on('collect', reaction => {
								const emote = reaction.emoji.name;
								resolve(commonGuilds[j + emotes.indexOf(emote) - 1]);
							});
							pages.push(collector);
						}
					}).then(server => {
						delete message.author.isMailing;
						pages.forEach(collector => collector.stop());
						Database.getServer(server.id).then(guild => {
							if (guild.get('threads')[message.author.id]) {
								message.channel.send(`Replying to your modmail in ${server.name}...`).then(() => {
									Database.replyToThread(args.join(' '), message, server.id).then(() => {
										message.channel.send('Your response was successfully delivered.');
									}).catch(err => {
										console.log(err);
										message.channel.send(err.message);
									});
								});
							} else {
								message.channel.send(`Creating a modmail in ${server.name}...`).then(() => {
									Database.postThread(server.id, args.join(' '), message, message.author).then(() => {
										message.channel.send('Your modmail was successfully created!');
									}).catch(err => {
										console.log(err);
										message.channel.send(err.message);
									});
								});
							}
						}).catch(err => {
							console.log(err);
							message.channel.send(err.message);
						});
					}).catch(err => {
						console.log(err);
						message.channel.send(err.message);
					});
					return;
				}
				Database.getServer(message.guild.id).then(guild => {
					if (!guild.get('category')) {
						return errify(`Please finish setting up the Bot, first! Type \`\`${prefix}help\`\` for assistance.`);
					}
					if (message.channel.parent?.id !== guild.get('category')) return errify("This command must be used in a modmail.");
					let content = args.join(' ');
					const snippets = guild.get('snippets');
					Object.entries(snippets).forEach(([key, value]) => {
						const rgx = new RegExp(`(?<!\\\\)$${key}`, 'g');
						content = content.replace(rgx, value);
					});
					if (content.length > 1000) {
						return message.channel.send(`The message could not be delivered: Character limit is 1000.`);
					}
					Database.replyToThread(content, message, false).then(() => {
						message.channel.send(`Replied with: \`\`\`\n${content}\n\`\`\``);
					}).catch(err => {
						message.channel.send(`The message could not be delivered: ${err.message}`);
					});
				});
				break;
			}
			case 'close': {
				if (message.channel.type === 'dm') {
					// In DMs; closed by OP
					if (message.author.isMailing) return message.author.isMailing(args.join(' '));
					message.channel.send(`Please select a server: `
						+ `(you can use reactions, or simply post the server name / ID / index)`);
					const emotes = [
						"\u{30}\u{fe0f}\u{20e3}",
						"\u{31}\u{fe0f}\u{20e3}",
						"\u{32}\u{fe0f}\u{20e3}",
						"\u{33}\u{fe0f}\u{20e3}",
						"\u{34}\u{fe0f}\u{20e3}",
						"\u{35}\u{fe0f}\u{20e3}",
						"\u{36}\u{fe0f}\u{20e3}",
						"\u{37}\u{fe0f}\u{20e3}",
						"\u{38}\u{fe0f}\u{20e3}",
						"\u{39}\u{fe0f}\u{20e3}",
						"\u{1f51f}"
					];
					const commonGuilds = [...client.guilds.cache.filter(guild => guild.members.cache.has(message.author.id)).values()];
					function generateEmbed (start) {
						const thisList = commonGuilds.slice(start, start + 10);
						const embed = new Embed();
						embed.setColor(Colours.blurple);
						embed.setTitle('Select Guild (React accordingly)');
						embed.setFooter(`Page ${Math.round(start / 10 + 1)} of ${Math.ceil(commonGuilds.length / 10)}`);
						embed.addFields(thisList.map((term, i) => {
							return { name: '\u200b', value: `#${start + i + 1} (${emotes[i + 1]}) ${term.name}` };
						}));
						embed.setTimestamp();
						return embed;
					}
					const pages = [];
					new Promise(async (resolve, reject) => {
						message.author.isMailing = function (content) {
							// Takes context to allow us to use text inputs in addition to reactions
							const intVer = parseInt(content.trim().replace(/^#/, ''));
							if (intVer > 100) {
								// server ID
								const guildByID = client.guilds.cache.get(String(intVer));
								if (guildByID && guildById.members.cache[message.author.id]) {
									resolve(guildByID);
									return true;
								}
								else message.channel.send(`Invalid guild ID.`);
							} else if (intVer <= 100 && intVer > 0) {
								// server index
								const guildByIndex = commonGuilds[intVer - 1];
								if (guildByIndex) {
									resolve(guildByIndex);
									return true;
								}
								else message.channel.send(`Invalid guild index.`);
							} else {
								// server name
								const guildByName = commonGuilds.find(guild => guild.name === content);
								if (guildByName) {
									resolve(guildByName);
									return true;
								}
								else message.channel.send(`Couldn't find a guild by that name.`);
							}
							return false;
						};
						for (let i = 0; i < commonGuilds.length; i += 10) {
							const msg = await message.channel.send(generateEmbed(i));
							const j = i;
							/*(async () => {
								for (let k = 1; k <= 10 && j * 10 + k <= commonGuilds.length; k++) await msg.react(emotes[k]);
							})();*/
							const collector = msg.createReactionCollector((reaction, reacter) => {
								if (reacter.id !== message.author.id) return false;
								const emote = reaction.emoji.name;
								if (!emotes.includes(emote)) return false;
								if (j + emotes.indexOf(emote) > commonGuilds.length) return false;
								return true;
							}, { time: 60000 });
							collector.on('collect', reaction => {
								const emote = reaction.emoji.name;
								resolve(commonGuilds[j + emotes.indexOf(emote) - 1]);
							});
							pages.push(collector);
						}
					}).then(server => {
						delete message.author.isMailing;
						pages.forEach(collector => collector.stop());
						Database.getServer(server.id).then(guild => {
							if (guild.get('threads')[message.author.id]) {
								message.channel.send(`Closing to your modmail in ${server.name}...`).then(() => {
									Database.closeThread(args.join(' '), message, server.id).then(() => {
										message.channel.send('Your modmail has been closed!');
									}).catch(err => {
										console.log(err);
										message.channel.send(err.message);
									});
								});
							} else {
								message.channel.send(`You don't have any active modmails in ${server.name}!`);
							}
						}).catch(err => {
							console.log(err);
							message.channel.send(err.message);
						});
					}).catch(err => {
						console.log(err);
						message.channel.send(err.message);
					});
					return;
				} else {
					// In channel; posted by staff
					Database.getServer(message.guild.id).then(guild => {
						if (!guild.get('category')) {
							return errify(`Please finish setting up the Bot, first! Type \`\`${prefix}help\`\` for assistance.`);
						}
						if (message.channel.parent?.id !== guild.get('category')) {
							return errify("This command must be used in a modmail.");
						}
						let content = args.join(' ');
						const snippets = guild.get('snippets');
						Object.entries(snippets).forEach(([key, value]) => {
							const rgx = new RegExp(`(?<!\\\\)$${key}`, 'g');
							content = content.replace(rgx, value);
						});
						if (content.length > 1000) {
							return message.channel.send(`The message could not be delivered: Character limit is 1000.`);
						}
						Database.closeThread(content, message, false).then(() => {
							message.channel.send(`Closed with: \`\`\`\n${content}\n\`\`\``);
						}).catch(err => {
							message.channel.send(`The modmail could not be closed: ${err.message}`);
						});
					});
				}
				break;
			}
			case 'mails': case 'modmails': case 'threads': {
				// Displays the current pending modmails / statistics in the server
				break;
			}
			case 'ban': {
				// Bans people from making modmails
				break;
			}
			case 'unban': {
				// Unbans banned modmailers
				break;
			}
			case 'snippets': {
				// Handles snippets
				break;
			}
			case 'mailfrom': case 'modmailfrom': {
				// Posts a modmail as a third person
				break;
			}
			case 'statistics': case 'stats': {
				// Posts ticket statistics from the server
				break;
			}
			default: {
				errify(`Unfortunately, I don't recognize that command.`);
			}
		}
	}
	commandHandler(command, args, false);
};