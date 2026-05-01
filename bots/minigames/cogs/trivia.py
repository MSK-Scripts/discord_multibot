"""
bots/minigames/cogs/trivia.py
───────────────────────────────
/trivia – Multiple-choice trivia questions via Open Trivia DB.
Questions are fetched live from https://opentdb.com/.
"""

from __future__ import annotations

import base64
import logging
import random
from typing import Optional

import aiohttp
import discord
from discord import app_commands
from discord.ext import commands
from discord.ui import Button, View

from core.points_manager import add_points, get_pts, notify_rewards, points_footer

log = logging.getLogger(__name__)

_API_URL = "https://opentdb.com/api.php?amount=1&type=multiple&encode=base64"

_DIFF_COLORS = {
    "easy":   discord.Color.green(),
    "medium": discord.Color.gold(),
    "hard":   discord.Color.red(),
}

_LABELS = ["🇦", "🇧", "🇨", "🇩"]


# ─── Lokale Fragenbank (Fallback wenn API nicht erreichbar) ───────────────────
_LOCAL_QUESTIONS = [
    {"category": "Science", "difficulty": "easy", "question": "What is the chemical symbol for water?", "correct_answer": "H₂O", "incorrect_answers": ["O₂", "CO₂", "H₂"]},
    {"category": "Science", "difficulty": "easy", "question": "How many planets are in our solar system?", "correct_answer": "8", "incorrect_answers": ["7", "9", "10"]},
    {"category": "Science", "difficulty": "medium", "question": "What is the speed of light (approx.) in km/s?", "correct_answer": "300,000", "incorrect_answers": ["150,000", "450,000", "1,000,000"]},
    {"category": "Science", "difficulty": "medium", "question": "What gas do plants absorb from the atmosphere?", "correct_answer": "Carbon dioxide", "incorrect_answers": ["Oxygen", "Nitrogen", "Hydrogen"]},
    {"category": "Science", "difficulty": "hard", "question": "What is the atomic number of gold?", "correct_answer": "79", "incorrect_answers": ["47", "82", "78"]},
    {"category": "Science", "difficulty": "hard", "question": "What is the powerhouse of the cell?", "correct_answer": "Mitochondria", "incorrect_answers": ["Nucleus", "Ribosome", "Golgi apparatus"]},
    {"category": "Geography", "difficulty": "easy", "question": "What is the capital of France?", "correct_answer": "Paris", "incorrect_answers": ["London", "Berlin", "Madrid"]},
    {"category": "Geography", "difficulty": "easy", "question": "What is the largest ocean on Earth?", "correct_answer": "Pacific Ocean", "incorrect_answers": ["Atlantic Ocean", "Indian Ocean", "Arctic Ocean"]},
    {"category": "Geography", "difficulty": "medium", "question": "Which country has the most natural lakes?", "correct_answer": "Canada", "incorrect_answers": ["Russia", "USA", "Finland"]},
    {"category": "Geography", "difficulty": "medium", "question": "What is the longest river in the world?", "correct_answer": "Nile", "incorrect_answers": ["Amazon", "Yangtze", "Mississippi"]},
    {"category": "Geography", "difficulty": "hard", "question": "What is the smallest country in the world by area?", "correct_answer": "Vatican City", "incorrect_answers": ["Monaco", "San Marino", "Liechtenstein"]},
    {"category": "Geography", "difficulty": "hard", "question": "Which African country was formerly known as Rhodesia?", "correct_answer": "Zimbabwe", "incorrect_answers": ["Zambia", "Mozambique", "Namibia"]},
    {"category": "History", "difficulty": "easy", "question": "In which year did World War II end?", "correct_answer": "1945", "incorrect_answers": ["1943", "1944", "1946"]},
    {"category": "History", "difficulty": "easy", "question": "Who was the first President of the United States?", "correct_answer": "George Washington", "incorrect_answers": ["Abraham Lincoln", "Thomas Jefferson", "John Adams"]},
    {"category": "History", "difficulty": "medium", "question": "In which year did the Berlin Wall fall?", "correct_answer": "1989", "incorrect_answers": ["1987", "1991", "1985"]},
    {"category": "History", "difficulty": "medium", "question": "Which empire was ruled by Julius Caesar?", "correct_answer": "Roman Empire", "incorrect_answers": ["Greek Empire", "Ottoman Empire", "Byzantine Empire"]},
    {"category": "History", "difficulty": "hard", "question": "The Battle of Hastings took place in which year?", "correct_answer": "1066", "incorrect_answers": ["1086", "1044", "1099"]},
    {"category": "History", "difficulty": "hard", "question": "Who wrote the 95 Theses that sparked the Protestant Reformation?", "correct_answer": "Martin Luther", "incorrect_answers": ["John Calvin", "Henry VIII", "Erasmus"]},
    {"category": "Entertainment", "difficulty": "easy", "question": "How many strings does a standard guitar have?", "correct_answer": "6", "incorrect_answers": ["4", "7", "8"]},
    {"category": "Entertainment", "difficulty": "easy", "question": "What sport is played at Wimbledon?", "correct_answer": "Tennis", "incorrect_answers": ["Cricket", "Golf", "Football"]},
    {"category": "Entertainment", "difficulty": "medium", "question": "Which movie won the first Academy Award for Best Picture?", "correct_answer": "Wings", "incorrect_answers": ["Sunrise", "The Jazz Singer", "7th Heaven"]},
    {"category": "Entertainment", "difficulty": "medium", "question": "In chess, how many squares are on the board?", "correct_answer": "64", "incorrect_answers": ["32", "48", "81"]},
    {"category": "Entertainment", "difficulty": "hard", "question": "Which band released the album 'Dark Side of the Moon'?", "correct_answer": "Pink Floyd", "incorrect_answers": ["Led Zeppelin", "The Who", "Deep Purple"]},
    {"category": "Entertainment", "difficulty": "hard", "question": "How many bones are in the adult human body?", "correct_answer": "206", "incorrect_answers": ["198", "214", "220"]},
    {"category": "Technology", "difficulty": "easy", "question": "What does 'CPU' stand for?", "correct_answer": "Central Processing Unit", "incorrect_answers": ["Central Power Unit", "Computer Processing Unit", "Core Processing Unit"]},
    {"category": "Technology", "difficulty": "easy", "question": "What does 'HTTP' stand for?", "correct_answer": "HyperText Transfer Protocol", "incorrect_answers": ["High Transfer Text Protocol", "HyperText Transmission Protocol", "Hyper Transfer Technology Protocol"]},
    {"category": "Technology", "difficulty": "medium", "question": "Which programming language was created by Guido van Rossum?", "correct_answer": "Python", "incorrect_answers": ["Java", "Ruby", "Perl"]},
    {"category": "Technology", "difficulty": "medium", "question": "What does 'RAM' stand for?", "correct_answer": "Random Access Memory", "incorrect_answers": ["Read Access Memory", "Rapid Access Memory", "Read And Modify"]},
    {"category": "Technology", "difficulty": "hard", "question": "In what year was the first iPhone released?", "correct_answer": "2007", "incorrect_answers": ["2005", "2006", "2008"]},
    {"category": "Technology", "difficulty": "hard", "question": "What is the binary representation of the decimal number 10?", "correct_answer": "1010", "incorrect_answers": ["1001", "1100", "0110"]},
    {"category": "Mathematics", "difficulty": "easy", "question": "What is the value of Pi (to 2 decimal places)?", "correct_answer": "3.14", "incorrect_answers": ["3.12", "3.16", "3.41"]},
    {"category": "Mathematics", "difficulty": "easy", "question": "What is 12 × 12?", "correct_answer": "144", "incorrect_answers": ["124", "132", "148"]},
    {"category": "Mathematics", "difficulty": "medium", "question": "What is the square root of 169?", "correct_answer": "13", "incorrect_answers": ["11", "12", "14"]},
    {"category": "Mathematics", "difficulty": "medium", "question": "What is 15% of 200?", "correct_answer": "30", "incorrect_answers": ["25", "35", "20"]},
    {"category": "Mathematics", "difficulty": "hard", "question": "What is the 10th number in the Fibonacci sequence?", "correct_answer": "55", "incorrect_answers": ["34", "89", "21"]},
    {"category": "Mathematics", "difficulty": "hard", "question": "What is the derivative of sin(x)?", "correct_answer": "cos(x)", "incorrect_answers": ["-cos(x)", "tan(x)", "-sin(x)"]},
]


def _b64(s: str) -> str:
    """Decodes a base64-encoded string from the OpenTrivia DB API."""
    return base64.b64decode(s).decode("utf-8")


async def _fetch_question() -> Optional[dict]:
    """Versucht eine Frage von der OpenTrivia DB API zu laden.
    Bei Netzwerkfehler: Fallback auf lokale Fragenbank."""
    try:
        connector = aiohttp.TCPConnector(ssl=False)
        async with aiohttp.ClientSession(connector=connector) as session:
            async with session.get(
                _API_URL, timeout=aiohttp.ClientTimeout(total=8)
            ) as resp:
                if resp.status != 200:
                    log.warning("Trivia API HTTP %d – using local bank", resp.status)
                    return _local_question()
                data = await resp.json(content_type=None)
                if data.get("response_code") != 0 or not data.get("results"):
                    log.warning("Trivia API response_code %s – using local bank", data.get("response_code"))
                    return _local_question()
                q = data["results"][0]
                log.debug("Trivia question fetched from API.")
                return {
                    "category":          _b64(q["category"]),
                    "difficulty":        _b64(q["difficulty"]),
                    "question":          _b64(q["question"]),
                    "correct_answer":    _b64(q["correct_answer"]),
                    "incorrect_answers": [_b64(a) for a in q["incorrect_answers"]],
                    "source": "api",
                }
    except Exception as exc:
        log.info("Trivia API nicht erreichbar (%s: %s) – using local bank.", type(exc).__name__, exc)
        return _local_question()


def _local_question() -> dict:
    """Returns a random question from the built-in question bank."""
    q = random.choice(_LOCAL_QUESTIONS).copy()
    q["source"] = "local"
    return q


class TriviaView(View):
    def __init__(self, player: discord.User, question: dict, answers: list, correct_idx: int) -> None:
        super().__init__(timeout=30)
        self.player      = player
        self.correct_idx = correct_idx
        self.answered    = False

        for i, answer in enumerate(answers):
            btn = Button(
                label=f"{_LABELS[i]}  {answer[:75]}",  # Discord label max 80 chars
                style=discord.ButtonStyle.primary,
                custom_id=f"trivia_{i}",
                row=0 if i < 2 else 1,
            )
            btn.callback = self._make_callback(i, question, answers)
            self.add_item(btn)

    def _make_callback(self, index: int, question: dict, answers: list):
        async def callback(interaction: discord.Interaction) -> None:
            if interaction.user.id != self.player.id:
                await interaction.response.send_message("❌ This is not your game!", ephemeral=True)
                return
            if self.answered:
                await interaction.response.defer()
                return

            self.answered = True
            correct = index == self.correct_idx

            for i, item in enumerate(self.children):
                item.disabled = True
                if i == self.correct_idx:
                    item.style = discord.ButtonStyle.success
                elif i == index and not correct:
                    item.style = discord.ButtonStyle.danger
            self.stop()

            # Punkte vergeben
            diff      = question["difficulty"]
            outcome   = "win" if correct else "lose"
            pts_delta = get_pts("trivia", diff, outcome)
            old, new  = await add_points(interaction.user.id, pts_delta)

            if correct:
                result_text = f"✅ **Correct!** Well done!"
                color       = discord.Color.green()
            else:
                result_text = f"❌ **Wrong!** The correct answer was:\n**{_LABELS[self.correct_idx]}  {answers[self.correct_idx]}**"
                color       = discord.Color.red()

            embed = _build_embed(question, answers, color, result_text, pts_delta, new)
            await interaction.response.edit_message(embed=embed, view=self)
            await notify_rewards(interaction, old, new)

        return callback

    async def on_timeout(self) -> None:
        if not self.answered:
            for item in self.children:
                item.disabled = True
                if self.children.index(item) == self.correct_idx:
                    item.style = discord.ButtonStyle.success
            self.stop()


def _build_embed(question: dict, answers: list, color: discord.Color, result: str = "", pts_delta: int = 0, total: int = 0) -> discord.Embed:
    diff    = question["difficulty"].capitalize()
    options = "\n".join(f"{_LABELS[i]}  {a}" for i, a in enumerate(answers))
    footer  = "Trivia  •  /trivia for a new question"
    if pts_delta != 0:
        footer += f"  •  {points_footer(pts_delta, total)}"
    embed = discord.Embed(
        title=f"🧠 Trivia – {question['category']}",
        description=f"**{question['question']}**\n\n{options}",
        color=color,
    )
    embed.add_field(name="Difficulty", value=diff, inline=True)
    if result:
        embed.add_field(name="Result", value=result, inline=False)
    embed.set_footer(text=footer)
    return embed


class TriviaCog(commands.Cog, name="Trivia"):
    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot

    @app_commands.command(name="trivia", description="Answer a random multiple-choice trivia question!")
    @app_commands.checks.cooldown(1, 5, key=lambda i: i.user.id)
    async def trivia(self, interaction: discord.Interaction) -> None:
        await interaction.response.defer()

        question = await _fetch_question()
        if not question:
            await interaction.followup.send(
                "❌ Could not fetch a trivia question right now. Please try again in a moment.",
                ephemeral=True,
            )
            return

        # Shuffle answers
        answers  = question["incorrect_answers"] + [question["correct_answer"]]
        random.shuffle(answers)
        correct_idx = answers.index(question["correct_answer"])

        color = _DIFF_COLORS.get(question["difficulty"], discord.Color.blurple())
        embed = _build_embed(question, answers, color)
        view  = TriviaView(interaction.user, question, answers, correct_idx)
        await interaction.followup.send(embed=embed, view=view)


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(TriviaCog(bot))
