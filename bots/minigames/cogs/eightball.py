"""
bots/minigames/cogs/eightball.py
──────────────────────────────────
/8ball – Magic 8-Ball with 20 classic responses.
"""

from __future__ import annotations

import random
import logging

import discord
from discord import app_commands
from discord.ext import commands

log = logging.getLogger(__name__)

# 20 classic Magic 8-Ball responses split into three categories
_POSITIVE = [
    "It is certain.",
    "It is decidedly so.",
    "Without a doubt.",
    "Yes, definitely.",
    "You may rely on it.",
    "As I see it, yes.",
    "Most likely.",
    "Outlook good.",
    "Yes.",
    "Signs point to yes.",
]
_NEUTRAL = [
    "Reply hazy, try again.",
    "Ask again later.",
    "Better not tell you now.",
    "Cannot predict now.",
    "Concentrate and ask again.",
]
_NEGATIVE = [
    "Don't count on it.",
    "My reply is no.",
    "My sources say no.",
    "Outlook not so good.",
    "Very doubtful.",
]

_ALL = _POSITIVE + _NEUTRAL + _NEGATIVE

_COLORS = {
    "positive": discord.Color.green(),
    "neutral":  discord.Color.gold(),
    "negative": discord.Color.red(),
}


def _pick() -> tuple:
    """Returns (response, category_key)."""
    response = random.choice(_ALL)
    if response in _POSITIVE:
        return response, "positive"
    if response in _NEUTRAL:
        return response, "neutral"
    return response, "negative"


class EightBallCog(commands.Cog, name="8Ball"):
    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    @app_commands.command(name="8ball", description="Ask the Magic 8-Ball a yes/no question!")
    @app_commands.describe(question="Your yes/no question")
    async def eightball(self, interaction: discord.Interaction, question: str) -> None:
        response, category = _pick()

        embed = discord.Embed(color=_COLORS[category])
        embed.set_author(name="🎱 Magic 8-Ball")
        embed.add_field(name="❓ Question", value=question, inline=False)
        embed.add_field(name="🔮 Answer",   value=f"*{response}*", inline=False)
        embed.set_footer(text=f"Asked by {interaction.user.display_name}")

        await interaction.response.send_message(embed=embed)


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(EightBallCog(bot))
