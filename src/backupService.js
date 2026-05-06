const fs = require("fs-extra");
const path = require("path");
const {
  ChannelType,
  PermissionsBitField,
  OverwriteType
} = require("discord.js");

const BACKUP_ROOT = path.join(process.cwd(), "backups");
const PERMS_BACKUP_ROOT = path.join(process.cwd(), "backups-perms");

function sanitizeId(input) {
  return String(input || "").replace(/[^\d]/g, "");
}

function channelPosition(a, b) {
  return (a.rawPosition ?? 0) - (b.rawPosition ?? 0);
}

function normalizePermissionOverwrites(overwrites) {
  return overwrites.map((o) => ({
    id: o.id,
    type: o.type,
    allow: o.allow?.bitfield?.toString?.() ?? "0",
    deny: o.deny?.bitfield?.toString?.() ?? "0"
  }));
}

async function createBackup(guild, creatorId) {
  const createdAt = Date.now();
  const guildDir = path.join(BACKUP_ROOT, guild.id);
  await fs.ensureDir(guildDir);

  const roles = guild.roles.cache
    .filter((role) => role.id !== guild.id && !role.managed)
    .sort((a, b) => b.position - a.position)
    .map((role) => ({
      id: role.id,
      name: role.name,
      position: role.position,
      color: role.color,
      hoist: role.hoist,
      permissions: role.permissions.bitfield.toString(),
      mentionable: role.mentionable
    }));

  const channels = guild.channels.cache
    .sort(channelPosition)
    .map((channel) => ({
      id: channel.id,
      name: channel.name,
      type: channel.type,
      topic: "topic" in channel ? channel.topic : null,
      nsfw: "nsfw" in channel ? channel.nsfw : false,
      bitrate: "bitrate" in channel ? channel.bitrate : null,
      userLimit: "userLimit" in channel ? channel.userLimit : null,
      rateLimitPerUser: "rateLimitPerUser" in channel ? channel.rateLimitPerUser : null,
      parentId: channel.parentId,
      rawPosition: channel.rawPosition ?? 0,
      permissionOverwrites: normalizePermissionOverwrites(channel.permissionOverwrites.cache)
    }));

  const data = {
    backupId: `${createdAt}`,
    createdAt,
    creatorId,
    guild: {
      id: guild.id,
      name: guild.name,
      afkTimeout: guild.afkTimeout,
      verificationLevel: guild.verificationLevel,
      explicitContentFilter: guild.explicitContentFilter,
      defaultMessageNotifications: guild.defaultMessageNotifications
    },
    roles,
    channels
  };

  const filepath = path.join(guildDir, `${data.backupId}.json`);
  await fs.writeJson(filepath, data, { spaces: 2 });
  return data;
}

async function createPermissionsBackup(guild, creatorId) {
  const createdAt = Date.now();
  const guildDir = path.join(PERMS_BACKUP_ROOT, guild.id);
  await fs.ensureDir(guildDir);

  const roles = guild.roles.cache
    .filter((role) => !role.managed)
    .map((role) => ({
      id: role.id,
      name: role.id === guild.id ? "@everyone" : role.name
    }));

  const channels = guild.channels.cache
    .sort(channelPosition)
    .map((channel) => ({
      id: channel.id,
      name: channel.name,
      type: channel.type,
      parentId: channel.parentId,
      permissionOverwrites: normalizePermissionOverwrites(channel.permissionOverwrites.cache)
    }));

  const data = {
    backupId: `${createdAt}`,
    createdAt,
    creatorId,
    guild: {
      id: guild.id,
      name: guild.name
    },
    roles,
    channels
  };

  const filepath = path.join(guildDir, `${data.backupId}.json`);
  await fs.writeJson(filepath, data, { spaces: 2 });
  return data;
}

async function listBackups(guildId) {
  const cleanGuildId = sanitizeId(guildId);
  const guildDir = path.join(BACKUP_ROOT, cleanGuildId);
  if (!(await fs.pathExists(guildDir))) return [];

  const files = (await fs.readdir(guildDir))
    .filter((file) => file.endsWith(".json"))
    .sort()
    .reverse();

  const all = [];
  for (const file of files) {
    const backup = await fs.readJson(path.join(guildDir, file));
    all.push({
      backupId: backup.backupId,
      createdAt: backup.createdAt,
      creatorId: backup.creatorId,
      channelsCount: backup.channels?.length ?? 0,
      rolesCount: backup.roles?.length ?? 0
    });
  }
  return all;
}

async function getBackup(guildId, backupId) {
  const cleanGuildId = sanitizeId(guildId);
  const cleanBackupId = sanitizeId(backupId);
  const filepath = path.join(BACKUP_ROOT, cleanGuildId, `${cleanBackupId}.json`);
  if (!(await fs.pathExists(filepath))) return null;
  return fs.readJson(filepath);
}

async function getBackupAnyServer(backupId) {
  const ownerGuildId = await findBackupGuildId(backupId);
  if (!ownerGuildId) return null;
  const backup = await getBackup(ownerGuildId, backupId);
  if (!backup) return null;
  return {
    ownerGuildId,
    backup
  };
}

async function findBackupGuildId(backupId) {
  const cleanBackupId = sanitizeId(backupId);
  if (!cleanBackupId) return null;
  if (!(await fs.pathExists(BACKUP_ROOT))) return null;

  const guildDirs = await fs.readdir(BACKUP_ROOT);
  for (const guildDir of guildDirs) {
    const fullPath = path.join(BACKUP_ROOT, guildDir, `${cleanBackupId}.json`);
    if (await fs.pathExists(fullPath)) {
      return guildDir;
    }
  }
  return null;
}

async function findPermissionsBackupGuildId(backupId) {
  const cleanBackupId = sanitizeId(backupId);
  if (!cleanBackupId) return null;
  if (!(await fs.pathExists(PERMS_BACKUP_ROOT))) return null;

  const guildDirs = await fs.readdir(PERMS_BACKUP_ROOT);
  for (const guildDir of guildDirs) {
    const fullPath = path.join(PERMS_BACKUP_ROOT, guildDir, `${cleanBackupId}.json`);
    if (await fs.pathExists(fullPath)) {
      return guildDir;
    }
  }
  return null;
}

async function getPermissionsBackup(guildId, backupId) {
  const cleanGuildId = sanitizeId(guildId);
  const cleanBackupId = sanitizeId(backupId);
  const filepath = path.join(PERMS_BACKUP_ROOT, cleanGuildId, `${cleanBackupId}.json`);
  if (!(await fs.pathExists(filepath))) return null;
  return fs.readJson(filepath);
}

async function getPermissionsBackupAnyServer(backupId) {
  const ownerGuildId = await findPermissionsBackupGuildId(backupId);
  if (!ownerGuildId) return null;
  const backup = await getPermissionsBackup(ownerGuildId, backupId);
  if (!backup) return null;
  return {
    ownerGuildId,
    backup
  };
}

async function deleteBackup(guildId, backupId) {
  const cleanGuildId = sanitizeId(guildId);
  const cleanBackupId = sanitizeId(backupId);
  const filepath = path.join(BACKUP_ROOT, cleanGuildId, `${cleanBackupId}.json`);
  if (!(await fs.pathExists(filepath))) return false;
  await fs.remove(filepath);
  return true;
}

function toPermissionOverwrite(entry, roleMap) {
  const mappedId = roleMap.get(entry.id) ?? entry.id;
  if (!mappedId) return null;
  return {
    id: mappedId,
    type: entry.type === OverwriteType.Role ? OverwriteType.Role : OverwriteType.Member,
    allow: new PermissionsBitField(BigInt(entry.allow || "0")),
    deny: new PermissionsBitField(BigInt(entry.deny || "0"))
  };
}

function buildRoleIdToNameMap(backup) {
  const map = new Map();
  for (const role of backup.roles ?? []) {
    map.set(role.id, role.name);
  }
  return map;
}

function resolveChannelParentName(channelData, channelById) {
  if (!channelData.parentId) return null;
  const parent = channelById.get(channelData.parentId);
  return parent?.name ?? null;
}

function findTargetChannel(guild, channelData, channelById) {
  const parentName = resolveChannelParentName(channelData, channelById);
  return guild.channels.cache.find((ch) => {
    if (ch.type !== channelData.type) return false;
    if (ch.name !== channelData.name) return false;
    const currentParentName = ch.parent?.name ?? null;
    return currentParentName === parentName;
  });
}

function mapOverwriteForExistingGuild(entry, guild, roleIdToName, backup) {
  if (entry.type === OverwriteType.Member) {
    const memberExists = guild.members.cache.has(entry.id);
    if (!memberExists) return null;
    return {
      id: entry.id,
      type: OverwriteType.Member,
      allow: new PermissionsBitField(BigInt(entry.allow || "0")),
      deny: new PermissionsBitField(BigInt(entry.deny || "0"))
    };
  }

  if (entry.id === backup.guild?.id) {
    return {
      id: guild.id,
      type: OverwriteType.Role,
      allow: new PermissionsBitField(BigInt(entry.allow || "0")),
      deny: new PermissionsBitField(BigInt(entry.deny || "0"))
    };
  }

  const backupRoleName = roleIdToName.get(entry.id);
  if (!backupRoleName) return null;

  const targetRole = guild.roles.cache.find((r) => r.name === backupRoleName);
  const roleId = targetRole?.id ?? null;

  if (!roleId) return null;
  return {
    id: roleId,
    type: OverwriteType.Role,
    allow: new PermissionsBitField(BigInt(entry.allow || "0")),
    deny: new PermissionsBitField(BigInt(entry.deny || "0"))
  };
}

async function syncChannelPermissionsFromBackup(guild, backup) {
  const roleIdToName = buildRoleIdToNameMap(backup);
  const channelById = new Map((backup.channels ?? []).map((c) => [c.id, c]));
  const report = {
    syncedChannels: 0,
    missingChannels: 0,
    skippedOverwrites: 0,
    failedChannels: 0
  };

  for (const channelData of backup.channels ?? []) {
    const targetChannel = findTargetChannel(guild, channelData, channelById);
    if (!targetChannel) {
      report.missingChannels += 1;
      continue;
    }

    const overwrites = [];
    for (const entry of channelData.permissionOverwrites ?? []) {
      const mapped = mapOverwriteForExistingGuild(entry, guild, roleIdToName, backup);
      if (!mapped) {
        report.skippedOverwrites += 1;
        continue;
      }
      overwrites.push(mapped);
    }

    try {
      await targetChannel.permissionOverwrites.set(overwrites, "Sync des permissions depuis backup");
      report.syncedChannels += 1;
    } catch (error) {
      report.failedChannels += 1;
      console.error(
        `[BACKUP][SYNCPERMS][CHANNEL_ERROR] channel=${targetChannel.id} name=${targetChannel.name} error=${error.message}`
      );
    }
  }

  return report;
}

async function restoreBackup(guild, backup) {
  const roleMap = new Map();
  roleMap.set(guild.id, guild.id);

  const botMember = await guild.members.fetchMe();
  const botTopRolePosition = botMember.roles.highest.position;

  const deletableChannels = guild.channels.cache.filter((ch) => ch.deletable);
  for (const channel of deletableChannels.values()) {
    await channel.delete("Restoration depuis backup");
  }

  const deletableRoles = guild.roles.cache
    .filter((role) => role.id !== guild.id && !role.managed && role.position < botTopRolePosition);
  for (const role of deletableRoles.values()) {
    await role.delete("Restoration depuis backup");
  }

  for (const roleData of backup.roles ?? []) {
    const created = await guild.roles.create({
      name: roleData.name,
      color: roleData.color,
      hoist: roleData.hoist,
      mentionable: roleData.mentionable,
      permissions: new PermissionsBitField(BigInt(roleData.permissions || "0")),
      reason: "Restoration depuis backup"
    });
    roleMap.set(roleData.id, created.id);
  }

  const sortedRolesByPosition = [...(backup.roles ?? [])].sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0)
  );
  const maxAssignablePosition = Math.max(1, botTopRolePosition - 1);
  const rolePositions = [];
  for (let i = 0; i < sortedRolesByPosition.length; i += 1) {
    const roleData = sortedRolesByPosition[i];
    const newRoleId = roleMap.get(roleData.id);
    if (!newRoleId) continue;
    rolePositions.push({
      role: newRoleId,
      position: Math.min(i + 1, maxAssignablePosition)
    });
  }
  if (rolePositions.length) {
    await guild.roles.setPositions(rolePositions).catch(() => null);
  }

  const createdChannels = new Map();
  const orderedChannels = [...(backup.channels ?? [])].sort((a, b) => (a.rawPosition ?? 0) - (b.rawPosition ?? 0));

  for (const channelData of orderedChannels.filter((c) => c.type === ChannelType.GuildCategory)) {
    const created = await guild.channels.create({
      name: channelData.name,
      type: ChannelType.GuildCategory,
      position: channelData.rawPosition ?? undefined,
      permissionOverwrites: (channelData.permissionOverwrites ?? [])
        .map((o) => toPermissionOverwrite(o, roleMap))
        .filter(Boolean),
      reason: "Restoration depuis backup"
    });
    createdChannels.set(channelData.id, created.id);
  }

  for (const channelData of orderedChannels.filter((c) => c.type !== ChannelType.GuildCategory)) {
    const type = channelData.type;
    const options = {
      name: channelData.name,
      type,
      parent: channelData.parentId ? createdChannels.get(channelData.parentId) : null,
      position: channelData.rawPosition ?? undefined,
      permissionOverwrites: (channelData.permissionOverwrites ?? [])
        .map((o) => toPermissionOverwrite(o, roleMap))
        .filter(Boolean),
      reason: "Restoration depuis backup"
    };

    if (type === ChannelType.GuildText || type === ChannelType.GuildAnnouncement) {
      options.topic = channelData.topic;
      options.nsfw = channelData.nsfw;
      options.rateLimitPerUser = channelData.rateLimitPerUser ?? 0;
    }

    if (type === ChannelType.GuildVoice || type === ChannelType.GuildStageVoice) {
      options.bitrate = channelData.bitrate ?? undefined;
      options.userLimit = channelData.userLimit ?? undefined;
    }

    const created = await guild.channels.create(options);
    createdChannels.set(channelData.id, created.id);
  }

  for (const channelData of orderedChannels) {
    const newChannelId = createdChannels.get(channelData.id);
    const channel = guild.channels.cache.get(newChannelId);
    if (!channel) continue;
    await channel.setPosition(channelData.rawPosition ?? 0).catch(() => null);
  }

  await guild.edit({
    name: backup.guild?.name ?? guild.name,
    afkTimeout: backup.guild?.afkTimeout ?? guild.afkTimeout,
    verificationLevel: backup.guild?.verificationLevel ?? guild.verificationLevel,
    explicitContentFilter: backup.guild?.explicitContentFilter ?? guild.explicitContentFilter,
    defaultMessageNotifications:
      backup.guild?.defaultMessageNotifications ?? guild.defaultMessageNotifications
  });
}

module.exports = {
  createBackup,
  createPermissionsBackup,
  listBackups,
  getBackup,
  getBackupAnyServer,
  findBackupGuildId,
  getPermissionsBackup,
  getPermissionsBackupAnyServer,
  deleteBackup,
  restoreBackup,
  syncChannelPermissionsFromBackup
};
