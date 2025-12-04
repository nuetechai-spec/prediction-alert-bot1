require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  Partials
} = require('discord.js');

async function sendTestAlert() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel]
  });

  try {
    await client.login(process.env.DISCORD_TOKEN);
    
    client.once('ready', async () => {
      console.log(`✅ Logged in as ${client.user.tag}`);
      
      const channelId = process.env.DISCORD_ALERT_CHANNEL_ID;
      if (!channelId) {
        console.error('❌ DISCORD_ALERT_CHANNEL_ID not set in .env');
        process.exit(1);
      }
      
      try {
        const channel = await client.channels.fetch(channelId);
        console.log(`✅ Found channel: ${channel.name}`);
        
        // Import the sendTestAlert function logic
        const { EmbedBuilder } = require('discord.js');
        const mockMarket = {
          source: 'Sample',
          marketId: 'sample-123',
          title: 'Sample Market: Will Bot Deploy Successfully?',
          url: 'https://example.com/market/sample',
          resolvesAt: new Date(Date.now() + 45 * 60 * 1000).toISOString(),
          timeToResolveMs: 45 * 60 * 1000,
          lastPrice: 0.72,
          volume24h: 4200,
          liquidity: 5500,
          priceChange1h: 0.18,
          priceChange24h: 0.2,
          spread: 0.04,
          confidence: 87,
          bucket: '1H',
          explanations: ['solid liquidity', 'notable volume momentum', 'upward price drift']
        };
        
        const embed = new EmbedBuilder()
          .setTitle(mockMarket.title)
          .setURL(mockMarket.url)
          .setColor(0x2ecc71)
          .addFields(
            { name: 'Expires In', value: '45 minutes' },
            { name: 'Time Bucket', value: '1H ⚡' },
            { name: 'Probability', value: '72%', inline: true },
            { name: 'Confidence', value: '87 / 100', inline: true },
            { name: 'Liquidity', value: 'Medium ($5,500)', inline: true }
          )
          .setFooter({ text: 'Not financial advice. Verify before acting.' })
          .setTimestamp();
        
        await channel.send({
          content: `⚡ Sample • Sample Market: Will Bot Deploy Successfully?\nBucket: 1H | Probability: 72% | Confidence: 87/100\nsolid liquidity • notable volume momentum • upward price drift\n${mockMarket.url}\nNot financial advice. Use at your own risk.`,
          embeds: [embed]
        });
        
        console.log('✅ Test alert sent successfully!');
        await client.destroy();
        process.exit(0);
      } catch (err) {
        console.error('❌ Failed to send test alert:', err.message);
        await client.destroy();
        process.exit(1);
      }
    });
  } catch (err) {
    console.error('❌ Failed to login:', err.message);
    process.exit(1);
  }
}

sendTestAlert();









