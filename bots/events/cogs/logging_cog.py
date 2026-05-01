"""
bots/events/cogs/logging_cog.py
─────────────────────────────────
Protokolliert alle Guild-Events als farbige Embeds in den Log-Channel.

Geloggte Events:
  Member:   join, leave, update (name, nickname, rollen), ban, unban
  Messages: delete, bulk delete, edit
  Channels: create, delete, rename, topic
  Roles:    create, delete, rename, permissions
  Voice:    join, leave, move
  Invites:  create, delete
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

import discord
from discord.ext import commands

from core.config import guild as gcfg

log = logging.getLogger(__name__)

# ─── Farben pro Kategorie ─────────────────────────────────────────────────────

GREEN  = discord.Color.green()
RED    = discord.Color.red()
BLUE   = discord.Color.blurple()
GOLD   = discord.Color.gold()
ORANGE = discord.Color.orange()
GREY   = discord.Color.light_grey()
PURPLE = discord.Color.purple()


# ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

def _now() -> str:
    return datetime.now(tz=timezone.utc).strftime("%d/%m/%Y %H:%M:%S UTC")


def _embed(title: str, color: discord.Color, description: str = "") -> discord.Embed:
    """Erstellt ein einheitliches Log-Embed mit Timestamp im Footer."""
    e = discord.Embed(title=title, description=description, color=color)
    e.set_footer(text=_now())
    return e


def _changed_perms(before: discord.Permissions, after: discord.Permissions) -> list:
    """Gibt eine Liste der geänderten Berechtigungen zurück."""
    changes = []
    for perm, value in after:
        old_value = getattr(before, perm)
        if old_value != value:
            symbol = "✅" if value else "❌"
            changes.append(f"{symbol} `{perm.replace('_', ' ').title()}`")
    return changes


class LoggingCog(commands.Cog, name="Logging"):
    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    # ── Hilfsmethoden ─────────────────────────────────────────────────────────

    async def _log(self, embed: discord.Embed) -> None:
        """Sendet ein Embed in den Log-Channel. Loggt Fehler statt sie zu verschlucken."""
        channel = self.bot.get_channel(gcfg.LOG_CHANNEL_ID)
        if not channel:
            log.warning("Log-Channel nicht gefunden (ID: %d)", gcfg.LOG_CHANNEL_ID)
            return
        try:
            await channel.send(embed=embed)
        except discord.Forbidden:
            log.error("Keine Berechtigung, in Log-Channel %d zu senden.", gcfg.LOG_CHANNEL_ID)
        except discord.HTTPException as exc:
            log.error("Log-Nachricht fehlgeschlagen: %s", exc)

    async def _update_member_count(self) -> None:
        guild   = self.bot.get_guild(gcfg.ID)
        channel = self.bot.get_channel(gcfg.MEMBER_COUNT_CHANNEL_ID)
        if guild and channel:
            try:
                await channel.edit(name=f"𝑴𝒆𝒎𝒃𝒆𝒓𝒔: {guild.member_count}")
            except discord.Forbidden:
                log.warning("Keine Berechtigung, Member-Count-Channel zu bearbeiten.")

    async def _get_audit_user(
        self,
        guild: discord.Guild,
        action: discord.AuditLogAction,
        target_id: Optional[int] = None,
    ) -> Optional[discord.User]:
        """Liest den verantwortlichen User aus dem Audit Log."""
        try:
            async for entry in guild.audit_logs(limit=3, action=action):
                if target_id is None or (entry.target and entry.target.id == target_id):
                    return entry.user
        except discord.Forbidden:
            pass
        return None

    # ── Member Events ─────────────────────────────────────────────────────────

    @commands.Cog.listener()
    async def on_member_join(self, member: discord.Member) -> None:
        e = _embed("📥 Member Joined", GREEN)
        e.add_field(name="User",       value=f"{member.mention} (`{member.name}`)", inline=True)
        e.add_field(name="ID",         value=str(member.id),                        inline=True)
        e.add_field(name="Account Age",
                    value=member.created_at.strftime("%d/%m/%Y"),                   inline=True)
        e.set_thumbnail(url=member.display_avatar.url)
        await self._log(e)
        await self._update_member_count()

    @commands.Cog.listener()
    async def on_member_remove(self, member: discord.Member) -> None:
        # Prüfen ob Kick
        actor = await self._get_audit_user(member.guild, discord.AuditLogAction.kick, member.id)
        if actor:
            e = _embed("👢 Member Kicked", RED)
            e.add_field(name="User",    value=f"**{member.name}** (`{member.id}`)", inline=True)
            e.add_field(name="Kicked by", value=actor.mention,                      inline=True)
        else:
            e = _embed("📤 Member Left", GREY)
            e.add_field(name="User",    value=f"**{member.name}** (`{member.id}`)", inline=True)
            roles = [r.mention for r in member.roles if not r.is_default()]
            if roles:
                e.add_field(name="Roles", value=" ".join(roles), inline=False)
        e.set_thumbnail(url=member.display_avatar.url)
        await self._log(e)
        await self._update_member_count()

    @commands.Cog.listener()
    async def on_member_update(self, before: discord.Member, after: discord.Member) -> None:
        # ── Username-Änderung ─────────────────────────────────────────────────
        if before.name != after.name:
            e = _embed("✏️ Username Changed", BLUE)
            e.add_field(name="User",   value=after.mention,  inline=False)
            e.add_field(name="Before", value=before.name,    inline=True)
            e.add_field(name="After",  value=after.name,     inline=True)
            await self._log(e)

        # ── Nickname-Änderung ─────────────────────────────────────────────────
        if before.nick != after.nick:
            e = _embed("📝 Nickname Changed", BLUE)
            e.add_field(name="User",   value=after.mention,                    inline=False)
            e.add_field(name="Before", value=before.nick or "*none*",          inline=True)
            e.add_field(name="After",  value=after.nick  or "*removed*",       inline=True)
            await self._log(e)

        # ── Rollen-Änderungen ─────────────────────────────────────────────────
        added_roles   = [r for r in after.roles  if r not in before.roles]
        removed_roles = [r for r in before.roles if r not in after.roles]

        if added_roles:
            e = _embed("🟢 Role Added", GREEN)
            e.add_field(name="User",  value=after.mention,                           inline=True)
            e.add_field(name="Roles", value=" ".join(r.mention for r in added_roles), inline=True)
            await self._log(e)

        if removed_roles:
            e = _embed("🔴 Role Removed", RED)
            e.add_field(name="User",  value=after.mention,                              inline=True)
            e.add_field(name="Roles", value=" ".join(r.mention for r in removed_roles), inline=True)
            await self._log(e)

    @commands.Cog.listener()
    async def on_member_ban(self, guild: discord.Guild, user: discord.User) -> None:
        actor = await self._get_audit_user(guild, discord.AuditLogAction.ban, user.id)
        e = _embed("🔨 Member Banned", RED)
        e.add_field(name="User",      value=f"**{user.name}** (`{user.id}`)", inline=True)
        e.add_field(name="Banned by", value=actor.mention if actor else "Unknown", inline=True)
        e.set_thumbnail(url=user.display_avatar.url)
        await self._log(e)

    @commands.Cog.listener()
    async def on_member_unban(self, guild: discord.Guild, user: discord.User) -> None:
        actor = await self._get_audit_user(guild, discord.AuditLogAction.unban, user.id)
        e = _embed("✅ Member Unbanned", GREEN)
        e.add_field(name="User",        value=f"**{user.name}** (`{user.id}`)", inline=True)
        e.add_field(name="Unbanned by", value=actor.mention if actor else "Unknown", inline=True)
        await self._log(e)

    # ── Message Events ────────────────────────────────────────────────────────

    @commands.Cog.listener()
    async def on_message_delete(self, message: discord.Message) -> None:
        if not message.guild or message.author.bot:
            return

        # Audit Log nur lesen wenn die Nachricht nicht selbst gelöscht wurde
        deleter = None
        try:
            async for entry in message.guild.audit_logs(
                limit=1, action=discord.AuditLogAction.message_delete
            ):
                # Nur übernehmen wenn Ziel der Autor ist und es nicht selbst war
                if (entry.target and entry.target.id == message.author.id
                        and entry.user.id != message.author.id):
                    deleter = entry.user
        except discord.Forbidden:
            pass

        content = message.content or "*[no text content]*"
        if len(content) > 1000:
            content = content[:1000] + "…"

        e = _embed("🗑️ Message Deleted", RED)
        e.add_field(name="Author",  value=f"{message.author.mention} (`{message.author.name}`)", inline=True)
        e.add_field(name="Channel", value=f"<#{message.channel.id}>",                            inline=True)
        if deleter:
            e.add_field(name="Deleted by", value=deleter.mention, inline=True)
        e.add_field(name="Content", value=f"> {content}", inline=False)

        # Anhänge loggen
        if message.attachments:
            names = ", ".join(a.filename for a in message.attachments)
            e.add_field(name=f"Attachments ({len(message.attachments)})", value=names, inline=False)

        await self._log(e)

    @commands.Cog.listener()
    async def on_bulk_message_delete(self, messages: list) -> None:
        if not messages or not messages[0].guild:
            return
        channel = messages[0].channel
        e = _embed("🗑️ Bulk Message Delete", RED)
        e.add_field(name="Channel",  value=f"<#{channel.id}>",       inline=True)
        e.add_field(name="Deleted",  value=f"**{len(messages)}** messages", inline=True)
        await self._log(e)

    @commands.Cog.listener()
    async def on_message_edit(self, before: discord.Message, after: discord.Message) -> None:
        if not before.guild or before.author.bot:
            return
        if before.content == after.content:
            return

        before_content = before.content or "*[empty]*"
        after_content  = after.content  or "*[empty]*"

        if len(before_content) > 500:
            before_content = before_content[:500] + "…"
        if len(after_content) > 500:
            after_content  = after_content[:500]  + "…"

        e = _embed("✏️ Message Edited", GOLD)
        e.add_field(name="Author",  value=f"{before.author.mention} (`{before.author.name}`)", inline=True)
        e.add_field(name="Channel", value=f"<#{before.channel.id}>",                           inline=True)
        e.add_field(name="Jump to", value=f"[Message]({after.jump_url})",                      inline=True)
        e.add_field(name="Before",  value=f"> {before_content}",                               inline=False)
        e.add_field(name="After",   value=f"> {after_content}",                                inline=False)
        await self._log(e)

    # ── Channel Events ────────────────────────────────────────────────────────

    @commands.Cog.listener()
    async def on_guild_channel_create(self, channel: discord.abc.GuildChannel) -> None:
        actor = await self._get_audit_user(channel.guild, discord.AuditLogAction.channel_create)
        e = _embed("📁 Channel Created", GREEN)
        e.add_field(name="Channel",    value=f"<#{channel.id}> (`#{channel.name}`)", inline=True)
        e.add_field(name="Type",       value=str(channel.type).replace("_", " ").title(), inline=True)
        e.add_field(name="Created by", value=actor.mention if actor else "Unknown",   inline=True)
        await self._log(e)

    @commands.Cog.listener()
    async def on_guild_channel_delete(self, channel: discord.abc.GuildChannel) -> None:
        actor = await self._get_audit_user(channel.guild, discord.AuditLogAction.channel_delete)
        e = _embed("🗑️ Channel Deleted", RED)
        e.add_field(name="Channel",    value=f"**#{channel.name}** (`{channel.id}`)", inline=True)
        e.add_field(name="Type",       value=str(channel.type).replace("_", " ").title(), inline=True)
        e.add_field(name="Deleted by", value=actor.mention if actor else "Unknown",   inline=True)
        await self._log(e)

    @commands.Cog.listener()
    async def on_guild_channel_update(
        self, before: discord.abc.GuildChannel, after: discord.abc.GuildChannel
    ) -> None:
        changes = []

        if before.name != after.name:
            changes.append(f"**Name:** `#{before.name}` → `#{after.name}`")

        # Topic (nur bei TextChannels)
        before_topic = getattr(before, "topic", None)
        after_topic  = getattr(after,  "topic", None)
        if before_topic != after_topic:
            changes.append(
                f"**Topic:** {before_topic or '*none*'} → {after_topic or '*removed*'}"
            )

        # Slowmode
        before_slow = getattr(before, "slowmode_delay", None)
        after_slow  = getattr(after,  "slowmode_delay", None)
        if before_slow != after_slow:
            changes.append(f"**Slowmode:** `{before_slow}s` → `{after_slow}s`")

        # NSFW
        before_nsfw = getattr(before, "nsfw", None)
        after_nsfw  = getattr(after,  "nsfw", None)
        if before_nsfw != after_nsfw:
            changes.append(f"**NSFW:** `{before_nsfw}` → `{after_nsfw}`")

        if not changes:
            return

        actor = await self._get_audit_user(after.guild, discord.AuditLogAction.channel_update)
        e = _embed("✏️ Channel Updated", BLUE)
        e.add_field(name="Channel",     value=f"<#{after.id}>",                inline=True)
        e.add_field(name="Updated by",  value=actor.mention if actor else "Unknown", inline=True)
        e.add_field(name="Changes",     value="\n".join(changes),              inline=False)
        await self._log(e)

    # ── Role Events ───────────────────────────────────────────────────────────

    @commands.Cog.listener()
    async def on_guild_role_create(self, role: discord.Role) -> None:
        actor = await self._get_audit_user(role.guild, discord.AuditLogAction.role_create)
        e = _embed("🔑 Role Created", GREEN)
        e.add_field(name="Role",       value=f"{role.mention} (`{role.id}`)", inline=True)
        e.add_field(name="Created by", value=actor.mention if actor else "Unknown", inline=True)
        await self._log(e)

    @commands.Cog.listener()
    async def on_guild_role_delete(self, role: discord.Role) -> None:
        actor = await self._get_audit_user(role.guild, discord.AuditLogAction.role_delete)
        e = _embed("🗑️ Role Deleted", RED)
        e.add_field(name="Role",       value=f"**{role.name}** (`{role.id}`)", inline=True)
        e.add_field(name="Deleted by", value=actor.mention if actor else "Unknown", inline=True)
        await self._log(e)

    @commands.Cog.listener()
    async def on_guild_role_update(self, before: discord.Role, after: discord.Role) -> None:
        changes = []

        if before.name != after.name:
            changes.append(f"**Name:** `{before.name}` → `{after.name}`")

        if before.color != after.color:
            changes.append(f"**Color:** `{before.color}` → `{after.color}`")

        if before.hoist != after.hoist:
            changes.append(f"**Displayed separately:** `{before.hoist}` → `{after.hoist}`")

        if before.mentionable != after.mentionable:
            changes.append(f"**Mentionable:** `{before.mentionable}` → `{after.mentionable}`")

        # Berechtigungsänderungen (sicherheitskritisch)
        perm_changes = _changed_perms(before.permissions, after.permissions)
        if perm_changes:
            changes.append("**Permissions:**\n" + "\n".join(perm_changes))

        if not changes:
            return

        actor = await self._get_audit_user(after.guild, discord.AuditLogAction.role_update)
        # Rot wenn Berechtigungen geändert wurden (sicherheitsrelevant), sonst blau
        color = RED if perm_changes else BLUE
        e = _embed("✏️ Role Updated", color)
        e.add_field(name="Role",       value=after.mention,                    inline=True)
        e.add_field(name="Updated by", value=actor.mention if actor else "Unknown", inline=True)
        e.add_field(name="Changes",    value="\n".join(changes),               inline=False)
        await self._log(e)

    # ── Voice Events ──────────────────────────────────────────────────────────

    @commands.Cog.listener()
    async def on_voice_state_update(
        self,
        member: discord.Member,
        before: discord.VoiceState,
        after: discord.VoiceState,
    ) -> None:
        # Ignoriere Mute/Deafen-Änderungen – nur Channel-Wechsel loggen
        if before.channel == after.channel:
            return

        if before.channel is None and after.channel is not None:
            # Joined
            e = _embed("🔊 Voice Joined", GREEN)
            e.add_field(name="User",    value=f"{member.mention} (`{member.name}`)", inline=True)
            e.add_field(name="Channel", value=f"**{after.channel.name}**",           inline=True)

        elif before.channel is not None and after.channel is None:
            # Left
            e = _embed("🔇 Voice Left", GREY)
            e.add_field(name="User",    value=f"{member.mention} (`{member.name}`)", inline=True)
            e.add_field(name="Channel", value=f"**{before.channel.name}**",          inline=True)

        else:
            # Moved
            e = _embed("🔀 Voice Moved", BLUE)
            e.add_field(name="User",    value=f"{member.mention} (`{member.name}`)",      inline=True)
            e.add_field(name="From",    value=f"**{before.channel.name}**",               inline=True)
            e.add_field(name="To",      value=f"**{after.channel.name}**",                inline=True)

        await self._log(e)

    # ── Invite Events ─────────────────────────────────────────────────────────

    @commands.Cog.listener()
    async def on_invite_create(self, invite: discord.Invite) -> None:
        e = _embed("🔗 Invite Created", PURPLE)
        e.add_field(name="Created by", value=invite.inviter.mention if invite.inviter else "Unknown", inline=True)
        e.add_field(name="Code",       value=f"`{invite.code}`",    inline=True)
        e.add_field(name="Channel",    value=f"<#{invite.channel.id}>", inline=True)
        e.add_field(name="Max Uses",   value=str(invite.max_uses) if invite.max_uses else "∞", inline=True)
        e.add_field(name="Expires",
                    value=invite.expires_at.strftime("%d/%m/%Y %H:%M UTC") if invite.expires_at else "Never",
                    inline=True)
        await self._log(e)

    @commands.Cog.listener()
    async def on_invite_delete(self, invite: discord.Invite) -> None:
        e = _embed("🗑️ Invite Deleted", ORANGE)
        e.add_field(name="Code",    value=f"`{invite.code}`",        inline=True)
        e.add_field(name="Channel", value=f"<#{invite.channel.id}>", inline=True)
        await self._log(e)


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(LoggingCog(bot))
