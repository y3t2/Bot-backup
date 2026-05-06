require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionFlagsBits,
  EmbedBuilder
} = require("discord.js");
const {
  createBackup,
  createPermissionsBackup,
  listBackups,
  getBackup,
  getBackupAnyServer,
  getPermissionsBackup,
  getPermissionsBackupAnyServer,
  deleteBackup,
  restoreBackup,
  syncChannelPermissionsFromBackup
} = require("./backupService");

const token = process.env.DISCORD_TOKEN;
const prefix = process.env.PREFIX || "!";

if (!token) {
  throw new Error("DISCORD_TOKEN manquant dans le fichier .env");
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

function hasAdmin(member) {
  return member.permissions.has(PermissionFlagsBits.Administrator);
}

function helpMessage() {
  return [
    `\`${prefix}backup create\` -> creer un backup`,
    `\`${prefix}backup list\` -> lister les backups`,
    `\`${prefix}backup load <backupId>\` -> restaurer un backup`,
    `\`${prefix}backup permssave\` -> backup des permissions des salons`,
    `\`${prefix}backup permsload <backupId>\` -> restaurer permissions des salons`,
    `\`${prefix}backup syncperms <backupId>\` -> resynchroniser permissions salons`,
    `\`${prefix}backup delete <backupId>\` -> supprimer un backup`,
    `\`${prefix}backup help\` -> afficher l'aide`,
    `\`${prefix}help\` -> afficher l'aide`
  ].join("\n");
}

async function sendHelpMenu(message) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("Menu d'aide - Backup Bot")
    .setDescription("Commandes disponibles pour sauvegarder/restaurer ton serveur.")
    .addFields(
      { name: "Creer un backup", value: `\`${prefix}backup create\`` },
      { name: "Lister les backups", value: `\`${prefix}backup list\`` },
      { name: "Restaurer un backup", value: `\`${prefix}backup load <backupId>\`` },
      { name: "Backup perms salons", value: `\`${prefix}backup permssave\`` },
      { name: "Restaurer perms salons", value: `\`${prefix}backup permsload <backupId>\`` },
      { name: "Sync permissions salons", value: `\`${prefix}backup syncperms <backupId>\`` },
      { name: "Supprimer un backup", value: `\`${prefix}backup delete <backupId>\`` },
      { name: "Aide", value: `\`${prefix}backup help\` ou \`${prefix}help\`` }
    )
    .setFooter({ text: "Astuce: il faut la permission Administrateur." });

  await message.reply({ embeds: [embed] });
}

client.once("ready", () => {
  console.log(`Connecte comme ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;
  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/\s+/);
  const cmd = (args.shift() || "").toLowerCase();

  if (cmd === "help") {
    await sendHelpMenu(message);
    return;
  }

  if (cmd !== "backup") return;

  if (!hasAdmin(message.member)) {
    await message.reply("Tu dois etre administrateur pour utiliser cette commande.");
    return;
  }

  const sub = (args.shift() || "").toLowerCase();
  if (!sub) {
    await sendHelpMenu(message);
    return;
  }

  try {
    console.log(
      `[CMD] guild=${message.guild.id} user=${message.author.id} command=${cmd} sub=${sub} args=${args.join(" ")}`
    );

    if (sub === "help") {
      await sendHelpMenu(message);
      return;
    }

    if (sub === "create") {
      console.log(`[BACKUP][CREATE] debut guild=${message.guild.id}`);
      await message.reply("Backup en cours...");
      const backup = await createBackup(message.guild, message.author.id);
      console.log(
        `[BACKUP][CREATE] termine guild=${message.guild.id} backupId=${backup.backupId} roles=${backup.roles.length} channels=${backup.channels.length}`
      );
      await message.reply(
        `Backup cree avec succes.\nID: \`${backup.backupId}\`\nServeur: \`${message.guild.name}\``
      );
      return;
    }

    if (sub === "list") {
      console.log(`[BACKUP][LIST] guild=${message.guild.id}`);
      const backups = await listBackups(message.guild.id);
      if (!backups.length) {
        console.log(`[BACKUP][LIST] aucun backup guild=${message.guild.id}`);
        await message.reply("Aucun backup trouve pour ce serveur.");
        return;
      }

      console.log(`[BACKUP][LIST] total=${backups.length} guild=${message.guild.id}`);
      const lines = backups.slice(0, 10).map((b) => {
        const date = new Date(b.createdAt).toLocaleString("fr-FR");
        return `- \`${b.backupId}\` | ${date} | roles: ${b.rolesCount} | channels: ${b.channelsCount}`;
      });
      await message.reply(`Backups disponibles (max 10):\n${lines.join("\n")}`);
      return;
    }

    if (sub === "load") {
      const backupId = args[0];
      if (!backupId) {
        await message.reply(`Utilisation: \`${prefix}backup load <backupId>\``);
        return;
      }

      console.log(`[BACKUP][LOAD] recherche backupId=${backupId} guild=${message.guild.id}`);
      let backup = await getBackup(message.guild.id, backupId);
      let ownerGuildId = message.guild.id;

      if (!backup) {
        const backupInAnyServer = await getBackupAnyServer(backupId);
        if (backupInAnyServer) {
          backup = backupInAnyServer.backup;
          ownerGuildId = backupInAnyServer.ownerGuildId;
        }
      }

      if (!backup) {
        console.log(`[BACKUP][LOAD] introuvable backupId=${backupId}`);
        await message.reply(
          `Backup introuvable. Verifie l'ID avec \`${prefix}backup list\` puis reessaie.`
        );
        return;
      }

      console.log(
        `[BACKUP][LOAD] trouve backupId=${backupId} sourceGuild=${ownerGuildId} targetGuild=${message.guild.id}`
      );
      await message.reply(
        "Restauration en cours... Attention: les salons et roles actuels seront supprimes si possible."
      );
      await restoreBackup(message.guild, backup);
      console.log(`[BACKUP][LOAD] restauration terminee backupId=${backupId} targetGuild=${message.guild.id}`);
      if (ownerGuildId !== message.guild.id) {
        await message.reply(
          `Restauration terminee depuis le backup \`${backupId}\` (importe depuis le serveur \`${ownerGuildId}\`).`
        );
        return;
      }
      await message.reply(`Restauration terminee depuis le backup \`${backupId}\`.`);
      return;
    }

    if (sub === "permssave") {
      console.log(`[BACKUP][PERMSSAVE] debut guild=${message.guild.id}`);
      await message.reply("Backup des permissions salons en cours...");
      const permsBackup = await createPermissionsBackup(message.guild, message.author.id);
      console.log(
        `[BACKUP][PERMSSAVE] termine guild=${message.guild.id} backupId=${permsBackup.backupId} channels=${permsBackup.channels.length}`
      );
      await message.reply(
        `Backup permissions cree.\nID: \`${permsBackup.backupId}\`\nSalons: \`${permsBackup.channels.length}\``
      );
      return;
    }

    if (sub === "permsload") {
      const backupId = args[0];
      if (!backupId) {
        await message.reply(`Utilisation: \`${prefix}backup permsload <backupId>\``);
        return;
      }

      console.log(`[BACKUP][PERMSLOAD] recherche backupId=${backupId} guild=${message.guild.id}`);
      let permsBackup = await getPermissionsBackup(message.guild.id, backupId);
      let ownerGuildId = message.guild.id;

      if (!permsBackup) {
        const backupInAnyServer = await getPermissionsBackupAnyServer(backupId);
        if (backupInAnyServer) {
          permsBackup = backupInAnyServer.backup;
          ownerGuildId = backupInAnyServer.ownerGuildId;
        }
      }

      if (!permsBackup) {
        console.log(`[BACKUP][PERMSLOAD] introuvable backupId=${backupId}`);
        await message.reply("Backup permissions introuvable.");
        return;
      }

      await message.reply("Restauration des permissions salons en cours...");
      const report = await syncChannelPermissionsFromBackup(message.guild, permsBackup);
      console.log(
        `[BACKUP][PERMSLOAD] termine backupId=${backupId} sourceGuild=${ownerGuildId} synced=${report.syncedChannels} missing=${report.missingChannels} skipped=${report.skippedOverwrites} failed=${report.failedChannels}`
      );
      await message.reply(
        `Permissions restaurees.\nSalons sync: \`${report.syncedChannels}\`\nSalons introuvables: \`${report.missingChannels}\`\nOverwrites ignores: \`${report.skippedOverwrites}\`\nSalons en erreur: \`${report.failedChannels}\``
      );
      return;
    }

    if (sub === "delete") {
      const backupId = args[0];
      if (!backupId) {
        await message.reply(`Utilisation: \`${prefix}backup delete <backupId>\``);
        return;
      }

      const ok = await deleteBackup(message.guild.id, backupId);
      console.log(`[BACKUP][DELETE] guild=${message.guild.id} backupId=${backupId} deleted=${ok}`);
      await message.reply(ok ? `Backup \`${backupId}\` supprime.` : "Backup introuvable.");
      return;
    }

    if (sub === "syncperms") {
      const backupId = args[0];
      if (!backupId) {
        await message.reply(`Utilisation: \`${prefix}backup syncperms <backupId>\``);
        return;
      }

      console.log(`[BACKUP][SYNCPERMS] recherche backupId=${backupId} guild=${message.guild.id}`);
      let backup = await getBackup(message.guild.id, backupId);
      if (!backup) {
        const backupInAnyServer = await getBackupAnyServer(backupId);
        backup = backupInAnyServer?.backup ?? null;
      }

      if (!backup) {
        console.log(`[BACKUP][SYNCPERMS] introuvable backupId=${backupId}`);
        await message.reply(
          `Backup introuvable. Verifie l'ID avec \`${prefix}backup list\` puis reessaie.`
        );
        return;
      }

      await message.reply("Sync des permissions salons en cours...");
      const report = await syncChannelPermissionsFromBackup(message.guild, backup);
      console.log(
        `[BACKUP][SYNCPERMS] termine backupId=${backupId} synced=${report.syncedChannels} missing=${report.missingChannels} skipped=${report.skippedOverwrites} failed=${report.failedChannels}`
      );
      await message.reply(
        `Sync termine.\nSalons sync: \`${report.syncedChannels}\`\nSalons introuvables: \`${report.missingChannels}\`\nOverwrites ignores: \`${report.skippedOverwrites}\`\nSalons en erreur: \`${report.failedChannels}\``
      );
      return;
    }

    await message.reply(`Sous-commande inconnue.\n${helpMessage()}`);
  } catch (error) {
    console.error("Erreur backup:", error);
    console.error(
      `[BACKUP][ERROR] guild=${message.guild?.id} user=${message.author?.id} content="${message.content}"`
    );
    await message.reply(
      "Une erreur est survenue pendant l'operation. Regarde la console pour le detail."
    );
  }
});

client.login(token);
