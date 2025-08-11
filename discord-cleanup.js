const { Client, GatewayIntentBits, PermissionFlagsBits } = require('discord.js');

const DELETE_AFTER_DAYS = 15;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID; // Specific channel to clean

async function cleanupOldMessages() {
    if (!DISCORD_BOT_TOKEN) {
        console.log('Discord bot token not configured - skipping cleanup');
        return;
    }

    const client = new Client({ 
        intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] 
    });

    try {
        await client.login(DISCORD_BOT_TOKEN);
        console.log('Discord bot logged in for cleanup');

        const cutoffDate = new Date(Date.now() - (DELETE_AFTER_DAYS * 24 * 60 * 60 * 1000));
        let deletedCount = 0;

        for (const guild of client.guilds.cache.values()) {
            const channel = CHANNEL_ID ? 
                guild.channels.cache.get(CHANNEL_ID) : 
                guild.channels.cache.find(ch => ch.name.includes('news') || ch.name.includes('scraper'));

            if (!channel || !channel.isTextBased()) continue;

            const permissions = channel.permissionsFor(guild.members.me);
            if (!permissions?.has(PermissionFlagsBits.ManageMessages)) {
                console.log(`No permission to manage messages in #${channel.name}`);
                continue;
            }

            let lastMessageId;
            while (true) {
                const messages = await channel.messages.fetch({ 
                    limit: 100, 
                    ...(lastMessageId && { before: lastMessageId }) 
                });

                if (messages.size === 0) break;

                const oldMessages = messages.filter(msg => 
                    msg.createdAt < cutoffDate && msg.author.bot
                );

                if (oldMessages.size === 0) break;

                for (const message of oldMessages.values()) {
                    try {
                        await message.delete();
                        deletedCount++;
                        await new Promise(resolve => setTimeout(resolve, 200));
                    } catch (err) {
                        if (err.code !== 10008) {
                            console.log(`Delete error: ${err.message}`);
                        }
                    }
                }

                lastMessageId = messages.last().id;
            }
        }

        console.log(`Cleanup completed: deleted ${deletedCount} old messages`);
    } catch (error) {
        console.error('Discord cleanup failed:', error.message);
    } finally {
        client.destroy();
    }
}

module.exports = { cleanupOldMessages };