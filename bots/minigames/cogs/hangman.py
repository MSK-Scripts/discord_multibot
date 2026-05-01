"""
bots/minigames/cogs/hangman.py
────────────────────────────────
/hangman – Classic hangman game.
Letter guessing via a modal (text input) to avoid button limits.
"""

from __future__ import annotations

import logging
import random
from typing import Optional

import discord
from discord import app_commands
from discord.ext import commands
from discord.ui import Button, Modal, TextInput, View

from core.points_manager import add_points, get_pts, notify_rewards, points_footer

log = logging.getLogger(__name__)

# ─── Word list (varied difficulty) ───────────────────────────────────────────
_WORDS = [
    "python", "discord", "server", "keyboard", "monitor", "internet",
    "database", "network", "algorithm", "variable", "function", "library",
    "chocolate", "elephant", "umbrella", "hospital", "calendar", "mountain",
    "adventure", "butterfly", "computer", "language", "birthday", "football",
    "treasure", "universe", "apartment", "carnival", "dinosaur", "firework",
    "geography", "hamburger", "iceberg", "jellyfish", "kangaroo", "labyrinth",
    "marathon", "newspaper", "orchestra", "passport", "question", "rainbow",
    "sandwich", "telephone", "umbrella", "vacation", "waterfall", "xylophone",
    "yesterday", "zeppelin", "abstract", "blanket", "captain", "dolphin",
    "engine", "festival", "garlic", "horizon", "illusion", "journey",
]

# ─── ASCII hangman stages (0 = safe, 6 = dead) ───────────────────────────────
_STAGES = [
    # 0 – no mistakes
    "```\n  ___\n |   |\n |\n |\n |\n |\n_|_\n```",
    # 1
    "```\n  ___\n |   |\n |   O\n |\n |\n |\n_|_\n```",
    # 2
    "```\n  ___\n |   |\n |   O\n |   |\n |\n |\n_|_\n```",
    # 3
    "```\n  ___\n |   |\n |   O\n |  /|\n |\n |\n_|_\n```",
    # 4
    "```\n  ___\n |   |\n |   O\n |  /|\\\n |\n |\n_|_\n```",
    # 5
    "```\n  ___\n |   |\n |   O\n |  /|\\\n |  /\n |\n_|_\n```",
    # 6 – dead
    "```\n  ___\n |   |\n |   O\n |  /|\\\n |  / \\\n |\n_|_\n```",
]

_MAX_WRONG = len(_STAGES) - 1  # 6


# ─── Game state ───────────────────────────────────────────────────────────────

class HangmanGame:
    def __init__(self, word: str) -> None:
        self.word       = word.lower()
        self.guessed    = set()
        self.wrong      = 0

    @property
    def display_word(self) -> str:
        return " ".join(c if c in self.guessed else "\_" for c in self.word)

    @property
    def wrong_letters(self) -> str:
        bad = sorted(c for c in self.guessed if c not in self.word)
        return ", ".join(bad) if bad else "—"

    @property
    def is_won(self) -> bool:
        return all(c in self.guessed for c in self.word)

    @property
    def is_lost(self) -> bool:
        return self.wrong >= _MAX_WRONG

    def guess(self, letter: str) -> str:
        """Returns 'already', 'correct', 'wrong', 'won', 'lost'."""
        letter = letter.lower()
        if letter in self.guessed:
            return "already"
        self.guessed.add(letter)
        if letter in self.word:
            if self.is_won:
                return "won"
            return "correct"
        self.wrong += 1
        if self.is_lost:
            return "lost"
        return "wrong"


# ─── Modal ────────────────────────────────────────────────────────────────────

class GuessModal(Modal, title="Guess a Letter"):
    letter = TextInput(
        label="Enter a single letter",
        placeholder="e.g. A",
        min_length=1,
        max_length=1,
    )

    def __init__(self, view: "HangmanView") -> None:
        super().__init__()
        self._hview = view

    async def on_submit(self, interaction: discord.Interaction) -> None:
        char = self.letter.value.strip().lower()
        if not char.isalpha():
            await interaction.response.send_message("❌ Please enter a valid letter (A–Z).", ephemeral=True)
            return
        await self._hview.process_guess(interaction, char)


# ─── View ─────────────────────────────────────────────────────────────────────

class HangmanView(View):
    def __init__(self, player: discord.User, game: HangmanGame) -> None:
        super().__init__(timeout=180)
        self.player = player
        self.game   = game

    @discord.ui.button(label="🔤 Guess Letter", style=discord.ButtonStyle.primary, custom_id="hm_guess")
    async def guess_letter(self, interaction: discord.Interaction, button: Button) -> None:
        if interaction.user.id != self.player.id:
            await interaction.response.send_message("❌ This is not your game!", ephemeral=True)
            return
        await interaction.response.send_modal(GuessModal(self))

    async def process_guess(self, interaction: discord.Interaction, char: str) -> None:
        result = self.game.guess(char)

        if result == "already":
            await interaction.response.send_message(
                f"⚠️ You already guessed **{char.upper()}**!", ephemeral=True
            )
            return

        pts_delta, old, new = 0, 0, 0
        if result in ("won", "lost"):
            outcome   = "win" if result == "won" else "lose"
            pts_delta = get_pts("hangman", outcome)
            old, new  = await add_points(interaction.user.id, pts_delta)
            for item in self.children:
                item.disabled = True
            self.stop()

        embed = _build_embed(self.game, result, char, pts_delta, new)
        await interaction.response.edit_message(embed=embed, view=self)
        if result in ("won", "lost"):
            await notify_rewards(interaction, old, new)

    async def on_timeout(self) -> None:
        for item in self.children:
            item.disabled = True


# ─── Embed builder ────────────────────────────────────────────────────────────

def _build_embed(game: HangmanGame, result: str = "", char: str = "", pts_delta: int = 0, total: int = 0) -> discord.Embed:
    stage = _STAGES[min(game.wrong, _MAX_WRONG)]

    if result == "won":
        title  = "🏆 You won!"
        color  = discord.Color.green()
        footer = f"The word was: {game.word.upper()}  •  {points_footer(pts_delta, total)}"
    elif result == "lost":
        title  = "💀 Game Over!"
        color  = discord.Color.red()
        footer = f"The word was: {game.word.upper()}  •  {points_footer(pts_delta, total)}"
    elif result == "correct":
        title  = f"✅ '{char.upper()}' is in the word!"
        color  = discord.Color.green()
        footer = f"Wrong guesses: {game.wrong}/{_MAX_WRONG}"
    elif result == "wrong":
        title  = f"❌ '{char.upper()}' is not in the word!"
        color  = discord.Color.red()
        footer = f"Wrong guesses: {game.wrong}/{_MAX_WRONG}"
    else:
        title  = "🎯 Hangman"
        color  = discord.Color.blurple()
        footer = f"Wrong guesses: {game.wrong}/{_MAX_WRONG}"

    embed = discord.Embed(title=title, color=color)
    embed.add_field(name="Gallows",       value=stage,                   inline=True)
    embed.add_field(name="Word",          value=f"`{game.display_word}`", inline=False)
    embed.add_field(name="Wrong Letters", value=game.wrong_letters,       inline=True)
    embed.set_footer(text=footer + "  •  /hangman to play again")
    return embed


# ─── Cog ──────────────────────────────────────────────────────────────────────

class HangmanCog(commands.Cog, name="Hangman"):
    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    @app_commands.command(name="hangman", description="Play a game of Hangman!")
    async def hangman(self, interaction: discord.Interaction) -> None:
        word = random.choice(_WORDS)
        game = HangmanGame(word)
        view = HangmanView(interaction.user, game)
        embed = _build_embed(game)
        await interaction.response.send_message(embed=embed, view=view)


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(HangmanCog(bot))
