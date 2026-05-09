const { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require('discord.js');
const { addPoints, getPts, notifyRewards, pointsFooter } = require('../../../core/pointsManager');

const MAX_TRIES = 6;

const WORDS = [
  'about','above','abuse','actor','acute','admit','adult','after','again','agent','agree','ahead',
  'alarm','album','alert','alike','alive','allow','alone','along','alter','angel','anger','angle',
  'apple','apply','argue','arise','armor','aroma','arrow','asset','avoid','awake','award','awful',
  'basic','beach','beard','beast','began','begin','being','below','bench','black','blade','blame',
  'blank','blast','blaze','bleed','blend','bless','blind','block','blood','bloom','blown','board',
  'bonus','brain','brand','brave','break','breed','bride','brief','bring','broke','brown','build',
  'built','burst','buyer','candy','cargo','carry','catch','cause','chain','chair','chaos','charm',
  'chase','cheap','check','chess','chest','chief','child','civic','civil','claim','class','clean',
  'clear','clerk','click','cliff','climb','clock','clone','close','cloth','cloud','coach','coast',
  'count','court','cover','craft','crane','crash','crazy','cream','crime','cross','crowd','crown',
  'curve','cycle','daily','dance','depth','devil','diary','doubt','draft','drain','drama','dream',
  'dress','drift','drink','drive','eagle','early','earth','eight','elite','enemy','enter','equal',
  'error','event','every','exact','extra','faith','false','fancy','fault','feast','fence','fever',
  'field','fifth','fight','final','first','fixed','flame','flash','flesh','float','floor','flour',
  'focus','force','forge','forth','found','frame','frank','fraud','fresh','front','frost','fruit',
  'grace','grade','grain','grand','grant','grape','grasp','grass','great','green','grief','grill',
  'group','grown','guard','guest','guide','guild','heart','heavy','honor','horse','hotel','house',
  'human','humor','hurry','image','index','inner','input','issue','jewel','joint','judge','juice',
  'knife','knock','known','label','large','laser','later','laugh','layer','learn','leave','legal',
  'lemon','level','light','limit','local','logic','lower','lucky','magic','major','maker','march',
  'match','mayor','media','mercy','metal','mixed','model','money','month','mount','mouse','mouth',
  'movie','music','nerve','never','night','noble','noise','north','novel','nurse','occur','ocean',
  'olive','order','other','outer','owner','paint','panic','paper','party','paste','pause','peace',
  'pearl','phase','phone','photo','piece','pilot','pixel','place','plain','plane','plant','plate',
  'power','press','price','pride','prime','print','prize','probe','proof','prove','pulse','punch',
  'query','quote','raise','range','rapid','reach','ready','realm','reply','rider','right','rival',
  'river','robot','rough','round','route','royal','ruler','rural','saint','salad','scene','score',
  'serve','seven','shade','shake','shall','shame','shape','share','shark','sharp','shelf','shell',
  'shift','shine','shirt','shock','shoot','short','shout','sight','since','sixth','sixty','skill',
  'slash','slave','sleep','slice','slide','slope','small','smart','smash','smile','smoke','solar',
  'solid','solve','south','space','spark','speak','speed','spend','spice','spine','sport','spray',
  'squad','staff','stage','stain','stair','stake','stand','stare','start','state','steam','steel',
  'steep','stern','stick','still','sting','stock','stone','store','storm','story','stove','strap',
  'strip','study','style','sugar','suite','sunny','super','surge','swear','sweep','sweet','swift',
  'sword','syrup','table','taste','teach','teeth','tense','thank','theme','thick','thing','think',
  'those','three','tiger','tight','timer','title','today','token','topic','total','tough','towel',
  'tower','toxic','track','trade','trail','train','trash','treat','trend','trial','truck','truly',
  'trunk','trust','truth','twice','twist','under','until','upper','upset','urban','usage','usual',
  'vague','valid','valor','value','verse','viral','virus','visit','vital','voice','voter','wagon',
  'waste','watch','water','weave','wedge','where','while','white','whole','witch','world','worry',
  'worse','worst','worth','would','write','wrong','young','youth','zebra',
];

function evaluate(guess, target) {
  const result     = Array(5).fill('⬛');
  const targetArr  = [...target];

  for (let i = 0; i < 5; i++) {
    if (guess[i] === target[i]) { result[i] = '🟩'; targetArr[i] = null; }
  }
  for (let i = 0; i < 5; i++) {
    if (result[i] === '🟩') continue;
    const idx = targetArr.indexOf(guess[i]);
    if (idx !== -1) { result[i] = '🟨'; targetArr[idx] = null; }
  }
  return result;
}

function buildEmbed(guesses, word, won = false, lost = false, ptsDelta = 0, total = 0) {
  const triesLeft = MAX_TRIES - guesses.length;
  const rows = [
    ...guesses.map(([g, fb]) => `${fb.join('')}\n\`${g.toUpperCase().split('').join('  ')}\``),
    ...Array(triesLeft).fill('⬛⬛⬛⬛⬛\n`_ _ _ _ _`'),
  ];
  const board  = rows.join('\n\n');
  let footer   = 'Wordle  •  /wordle to play again';
  let title, color, desc;

  if (won) {
    title  = `🏆 You got it in ${guesses.length}/6!`;
    color  = 0x57F287;
    desc   = `${board}\n\nThe word was **${word.toUpperCase()}**. Well done!`;
    footer += `  •  ${pointsFooter(ptsDelta, total)}`;
  } else if (lost) {
    title  = '💀 Game Over!';
    color  = 0xED4245;
    desc   = `${board}\n\nThe word was **${word.toUpperCase()}**. Better luck next time!`;
    footer += `  •  ${pointsFooter(ptsDelta, total)}`;
  } else {
    title  = `🟩 Wordle – ${guesses.length}/${MAX_TRIES}`;
    color  = 0x5865F2;
    desc   = `${board}\n\n🟩 Correct  🟨 Wrong position  ⬛ Not in word`;
  }

  return new EmbedBuilder().setTitle(title).setDescription(desc).setColor(color).setFooter({ text: footer });
}

module.exports = {
  data: new SlashCommandBuilder().setName('wordle').setDescription('Guess the secret 5-letter word in 6 tries!'),

  async execute(interaction) {
    const word    = WORDS[Math.floor(Math.random() * WORDS.length)];
    const guesses = [];
    let gameOver  = false;

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('wordle_guess').setLabel('💬 Guess Word').setStyle(ButtonStyle.Primary)
    );

    await interaction.reply({ embeds: [buildEmbed(guesses, word)], components: [row] });
    const reply = await interaction.fetchReply();

    const collector = reply.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      time: 300_000,
    });

    collector.on('collect', async i => {
      if (gameOver) { await i.deferUpdate(); return; }

      const modal = new ModalBuilder().setCustomId(`wordle_modal_${Date.now()}`).setTitle('Enter your guess');
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('guess').setLabel('5-letter word').setPlaceholder('e.g. CRANE').setStyle(TextInputStyle.Short).setMinLength(5).setMaxLength(5).setRequired(true)
        )
      );
      await i.showModal(modal);

      const submitted = await i.awaitModalSubmit({ time: 60_000 }).catch(() => null);
      if (!submitted) return;

      const guess = submitted.fields.getTextInputValue('guess').trim().toLowerCase();
      if (!/^[a-z]{5}$/.test(guess)) {
        await submitted.reply({ content: '❌ Please enter exactly 5 letters.', flags: MessageFlags.Ephemeral });
        return;
      }

      const feedback = evaluate(guess, word);
      guesses.push([guess, feedback]);

      const won  = feedback.every(f => f === '🟩');
      const lost = guesses.length >= MAX_TRIES && !won;
      let ptsDelta = 0, oldPts = 0, newPts = 0;

      if (won || lost) {
        gameOver   = true;
        const key  = won ? `${guesses.length}_try` : 'lose';
        ptsDelta   = getPts('wordle', key);
        const pts  = addPoints(interaction.user.id, ptsDelta);
        oldPts = pts.old; newPts = pts.new;
        row.components[0].setDisabled(true);
        collector.stop();
      }

      await submitted.update({ embeds: [buildEmbed(guesses, word, won, lost, ptsDelta, newPts)], components: [row] });
      if (won || lost) await notifyRewards(submitted, oldPts, newPts);
    });

    collector.on('end', () => {
      if (!gameOver) {
        row.components[0].setDisabled(true);
        interaction.editReply({ components: [row] }).catch(() => {});
      }
    });
  },
};
