"""
bots/minigames/cogs/wordle.py
───────────────────────────────
/wordle – Guess the 5-letter word in 6 tries.
Feedback: 🟩 correct position | 🟨 wrong position | ⬛ not in word
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

_MAX_TRIES = 6

# ─── Word list ────────────────────────────────────────────────────────────────
_WORDS = [
    "about", "above", "abuse", "actor", "acute", "admit", "adult", "after",
    "again", "agent", "agree", "ahead", "alarm", "album", "alert", "alike",
    "alive", "allow", "alone", "along", "alter", "angel", "anger", "angle",
    "apple", "apply", "argue", "arise", "armor", "aroma", "arrow", "asset",
    "avoid", "awake", "award", "awful", "basic", "beach", "beard", "beast",
    "began", "begin", "being", "below", "bench", "black", "blade", "blame",
    "blank", "blast", "blaze", "bleed", "blend", "bless", "blind", "block",
    "blood", "bloom", "blown", "board", "bonus", "brain", "brand", "brave",
    "break", "breed", "bride", "brief", "bring", "broke", "brown", "build",
    "built", "burst", "buyer", "candy", "cargo", "carry", "catch", "cause",
    "chain", "chair", "chaos", "charm", "chase", "cheap", "check", "cheek",
    "chess", "chest", "chief", "child", "civic", "civil", "claim", "class",
    "clean", "clear", "clerk", "click", "cliff", "climb", "clock", "clone",
    "close", "cloth", "cloud", "coach", "coast", "comet", "comic", "coral",
    "count", "court", "cover", "craft", "crane", "crash", "crazy", "cream",
    "creek", "crime", "crisp", "cross", "crowd", "crown", "cruel", "crush",
    "curve", "cycle", "daily", "dance", "decor", "dense", "depth", "devil",
    "diary", "digit", "disco", "doubt", "dough", "draft", "drain", "drama",
    "drawn", "dread", "dream", "dress", "drift", "drink", "drive", "drove",
    "eagle", "early", "earth", "eight", "elite", "empty", "enemy", "enjoy",
    "enter", "equal", "error", "event", "every", "exact", "extra", "fable",
    "faith", "falls", "false", "fancy", "fatal", "fault", "feast", "fence",
    "fever", "fiber", "field", "fifth", "fifty", "fight", "final", "first",
    "fixed", "flame", "flare", "flash", "flask", "flesh", "fleet", "float",
    "floor", "flour", "fluid", "focus", "force", "forge", "forth", "found",
    "frame", "frank", "fraud", "fresh", "front", "frost", "fruit", "funny",
    "glade", "glare", "glass", "globe", "gloom", "glory", "gloss", "glove",
    "grace", "grade", "grain", "grand", "grant", "grape", "grasp", "grass",
    "great", "green", "greet", "grief", "grill", "grind", "groan", "gross",
    "group", "grove", "grown", "guard", "guest", "guide", "guild", "gusto",
    "haste", "haunt", "haven", "heart", "heave", "heavy", "hedge", "hence",
    "hobby", "honor", "horse", "hotel", "house", "human", "humor", "hurry",
    "ideal", "image", "imply", "index", "inner", "input", "inset", "intro",
    "irony", "issue", "ivory", "jewel", "joint", "joker", "judge", "juice",
    "juicy", "knife", "knock", "known", "label", "lance", "large", "laser",
    "later", "laugh", "layer", "learn", "lease", "least", "leave", "legal",
    "lemon", "level", "light", "limit", "linen", "liver", "lobby", "local",
    "logic", "loose", "lower", "lucky", "lunar", "lyric", "magic", "major",
    "maker", "manor", "march", "match", "mayor", "media", "mercy", "merge",
    "merit", "metal", "might", "mixed", "model", "money", "month", "moral",
    "mount", "mouse", "mouth", "movie", "music", "naive", "nerve", "never",
    "night", "noble", "noise", "north", "noted", "novel", "nurse", "occur",
    "ocean", "often", "olive", "onset", "optic", "order", "other", "outer",
    "owner", "oxide", "paint", "panic", "paper", "party", "paste", "patch",
    "pause", "peace", "pearl", "penny", "peril", "phase", "phone", "photo",
    "piano", "piece", "pilot", "pinch", "pixel", "pizza", "place", "plain",
    "plane", "plant", "plate", "plaza", "plead", "pluck", "plumb", "plume",
    "polar", "power", "press", "price", "pride", "prime", "print", "prior",
    "prize", "probe", "prone", "proof", "prose", "prove", "pulse", "punch",
    "purse", "query", "quota", "quote", "racer", "radio", "raise", "rally",
    "ranch", "range", "rapid", "ratio", "reach", "ready", "realm", "relax",
    "renew", "reply", "rider", "ridge", "rifle", "right", "risky", "rival",
    "river", "robot", "rocky", "rough", "round", "route", "royal", "ruler",
    "rural", "saint", "salad", "scene", "scent", "score", "scout", "screw",
    "seize", "serve", "seven", "shade", "shake", "shall", "shame", "shape",
    "share", "shark", "sharp", "sheen", "sheep", "sheer", "shelf", "shell",
    "shift", "shine", "shirt", "shock", "shoot", "short", "shout", "shove",
    "sight", "since", "sixth", "sixty", "skill", "skull", "slash", "slave",
    "sleep", "slice", "slide", "slope", "small", "smart", "smash", "smell",
    "smile", "smoke", "snack", "snail", "snake", "snare", "solar", "solid",
    "solve", "sorry", "south", "space", "spark", "speak", "speed", "spend",
    "spice", "spill", "spine", "sport", "spray", "squad", "staff", "stage",
    "stain", "stair", "stake", "stand", "stare", "start", "state", "steam",
    "steel", "steep", "steer", "stern", "stick", "stiff", "still", "sting",
    "stock", "stone", "store", "storm", "story", "stout", "stove", "strap",
    "straw", "strip", "study", "stump", "style", "sugar", "suite", "sunny",
    "super", "surge", "swamp", "swear", "sweep", "sweet", "swift", "sword",
    "syrup", "table", "taken", "taste", "teach", "tease", "teeth", "tempo",
    "tense", "thank", "theme", "there", "thick", "thing", "think", "third",
    "those", "three", "threw", "throw", "tiger", "tight", "timer", "title",
    "today", "token", "topic", "total", "tough", "towel", "tower", "toxic",
    "track", "trade", "trail", "train", "trait", "trash", "tread", "treat",
    "trend", "trial", "tried", "troop", "truck", "truly", "trunk", "trust",
    "truth", "twice", "twist", "umbra", "under", "unify", "union", "until",
    "upper", "upset", "urban", "usage", "usual", "utter", "vague", "valid",
    "valor", "value", "valve", "verse", "vigor", "viral", "virus", "visit",
    "vital", "vivid", "vocal", "voice", "voter", "wagon", "waste", "watch",
    "water", "weave", "wedge", "weird", "where", "while", "white", "whole",
    "wider", "witch", "world", "worry", "worse", "worst", "worth", "would",
    "wrath", "write", "wrong", "yacht", "yield", "young", "youth", "zebra",
]


# ─── Feedback logic ───────────────────────────────────────────────────────────

def _evaluate(guess: str, target: str) -> list:
    """Returns list of 5 emoji: 🟩 🟨 ⬛"""
    result = ["⬛"] * 5
    target_chars = list(target)

    # First pass: correct position
    for i in range(5):
        if guess[i] == target[i]:
            result[i]       = "🟩"
            target_chars[i] = None

    # Second pass: wrong position
    for i in range(5):
        if result[i] == "🟩":
            continue
        if guess[i] in target_chars:
            result[i] = "🟨"
            target_chars[target_chars.index(guess[i])] = None

    return result


# ─── Modal ────────────────────────────────────────────────────────────────────

class GuessModal(Modal, title="Enter your guess"):
    word = TextInput(
        label="5-letter word",
        placeholder="e.g. CRANE",
        min_length=5,
        max_length=5,
    )

    def __init__(self, view: "WordleView") -> None:
        super().__init__()
        self._wview = view

    async def on_submit(self, interaction: discord.Interaction) -> None:
        guess = self.word.value.strip().lower()
        if not guess.isalpha() or len(guess) != 5:
            await interaction.response.send_message(
                "❌ Please enter exactly 5 letters.", ephemeral=True
            )
            return
        await self._wview.process_guess(interaction, guess)


# ─── View ─────────────────────────────────────────────────────────────────────

class WordleView(View):
    def __init__(self, player: discord.User, word: str) -> None:
        super().__init__(timeout=300)
        self.player   = player
        self.word     = word
        self.guesses  = []   # list of (guess_str, feedback_list)
        self.game_over = False

    @discord.ui.button(label="💬 Guess Word", style=discord.ButtonStyle.primary, custom_id="wordle_guess")
    async def guess_word(self, interaction: discord.Interaction, button: Button) -> None:
        if interaction.user.id != self.player.id:
            await interaction.response.send_message("❌ This is not your game!", ephemeral=True)
            return
        if self.game_over:
            await interaction.response.defer()
            return
        await interaction.response.send_modal(GuessModal(self))

    async def process_guess(self, interaction: discord.Interaction, guess: str) -> None:
        feedback = _evaluate(guess, self.word)
        self.guesses.append((guess, feedback))

        won  = all(f == "🟩" for f in feedback)
        lost = len(self.guesses) >= _MAX_TRIES and not won

        pts_delta, old, new = 0, 0, 0
        if won or lost:
            self.game_over = True
            for item in self.children:
                item.disabled = True
            self.stop()
            if won:
                wordle_key = f"{len(self.guesses)}_try"
            else:
                wordle_key = "lose"
            pts_delta = get_pts("wordle", wordle_key)
            old, new  = await add_points(interaction.user.id, pts_delta)

        embed = _build_embed(self, won, lost, pts_delta, new)
        await interaction.response.edit_message(embed=embed, view=self)
        if won or lost:
            await notify_rewards(interaction, old, new)

    async def on_timeout(self) -> None:
        self.game_over = True
        for item in self.children:
            item.disabled = True


# ─── Embed builder ────────────────────────────────────────────────────────────

def _build_embed(view: WordleView, won: bool = False, lost: bool = False, pts_delta: int = 0, total: int = 0) -> discord.Embed:
    tries_left = _MAX_TRIES - len(view.guesses)

    rows = []
    for guess, feedback in view.guesses:
        emoji_row  = "".join(feedback)
        letter_row = "  ".join(c.upper() for c in guess)
        rows.append(f"{emoji_row}\n`{letter_row}`")
    for _ in range(tries_left):
        rows.append("⬛⬛⬛⬛⬛\n`_ _ _ _ _`")
    board  = "\n\n".join(rows)
    footer = "Wordle  •  /wordle to play again"

    if won:
        title  = f"🏆 You got it in {len(view.guesses)}/6!"
        color  = discord.Color.green()
        desc   = f"{board}\n\nThe word was **{view.word.upper()}**. Well done!"
        footer += f"  •  {points_footer(pts_delta, total)}"
    elif lost:
        title  = "💀 Game Over!"
        color  = discord.Color.red()
        desc   = f"{board}\n\nThe word was **{view.word.upper()}**. Better luck next time!"
        footer += f"  •  {points_footer(pts_delta, total)}"
    else:
        title = f"🟩 Wordle – {len(view.guesses)}/{_MAX_TRIES}"
        color = discord.Color.blurple()
        desc  = f"{board}\n\n🟩 Correct  🟨 Wrong position  ⬛ Not in word"

    embed = discord.Embed(title=title, description=desc, color=color)
    embed.set_footer(text=footer)
    return embed


# ─── Cog ──────────────────────────────────────────────────────────────────────

class WordleCog(commands.Cog, name="Wordle"):
    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    @app_commands.command(name="wordle", description="Guess the secret 5-letter word in 6 tries!")
    async def wordle(self, interaction: discord.Interaction) -> None:
        word = random.choice(_WORDS)
        view = WordleView(interaction.user, word)
        embed = _build_embed(view)
        await interaction.response.send_message(embed=embed, view=view)


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(WordleCog(bot))
