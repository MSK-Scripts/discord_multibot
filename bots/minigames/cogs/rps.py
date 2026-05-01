"""
bots/minigames/cogs/rps.py
───────────────────────────
/rps – Rock Paper Scissors against the bot via buttons.
"""

from __future__ import annotations

import random
import logging

import discord
from discord import app_commands
from discord.ext import commands
from discord.ui import Button, View

from core.points_manager import add_points, get_pts, notify_rewards, points_footer

log = logging.getLogger(__name__)

_CHOICES = {
    "rock":     {"emoji": "🪨", "beats": "scissors"},
    "paper":    {"emoji": "📄", "beats": "rock"},
    "scissors": {"emoji": "✂️",  "beats": "paper"},
}


def _result(player: str, bot: str) -> str:
    if player == bot:
        return "draw"
    if _CHOICES[player]["beats"] == bot:
        return "win"
    return "lose"


class RPSView(View):
    def __init__(self, player: discord.User) -> None:
        super().__init__(timeout=60)
        self.player = player

        for key, data in _CHOICES.items():
            btn = Button(
                label=f"{data['emoji']} {key.capitalize()}",
                style=discord.ButtonStyle.primary,
                custom_id=f"rps_{key}",
            )
            btn.callback = self._make_callback(key)
            self.add_item(btn)

    def _make_callback(self, choice: str):
        async def callback(interaction: discord.Interaction) -> None:
            if interaction.user.id != self.player.id:
                await interaction.response.send_message("❌ This is not your game!", ephemeral=True)
                return

            bot_choice = random.choice(list(_CHOICES.keys()))
            outcome    = _result(choice, bot_choice)
            p_emoji    = _CHOICES[choice]["emoji"]
            b_emoji    = _CHOICES[bot_choice]["emoji"]

            if outcome == "win":
                title, color = "🏆 You win!", discord.Color.green()
                desc = f"Your **{p_emoji} {choice}** beats the bot's **{b_emoji} {bot_choice}**!"
            elif outcome == "lose":
                title, color = "💀 You lose!", discord.Color.red()
                desc = f"The bot's **{b_emoji} {bot_choice}** beats your **{p_emoji} {choice}**!"
            else:
                title, color = "🤝 Draw!", discord.Color.gold()
                desc = f"Both chose **{p_emoji} {choice}**. No winner!"

            # Punkte vergeben
            pts_delta = get_pts("rps", outcome)
            old, new  = await add_points(interaction.user.id, pts_delta)

            embed = discord.Embed(title=title, description=desc, color=color)
            embed.set_footer(text=f"Rock Paper Scissors  •  /rps to play again  •  {points_footer(pts_delta, new)}")

            for item in self.children:
                item.disabled = True
            self.stop()
            await interaction.response.edit_message(embed=embed, view=self)
            await notify_rewards(interaction, old, new)
        return callback

    async def on_timeout(self) -> None:
        for item in self.children:
            item.disabled = True


class RPSCog(commands.Cog, name="RPS"):
    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    @app_commands.command(name="rps", description="Play Rock Paper Scissors against the bot!")
    async def rps(self, interaction: discord.Interaction) -> None:
        embed = discord.Embed(
            title="✂️ Rock Paper Scissors",
            description=f"{interaction.user.mention}, make your choice!",
            color=discord.Color.blurple(),
        )
        await interaction.response.send_message(embed=embed, view=RPSView(interaction.user))


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(RPSCog(bot))
