import pg from 'pg';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

export const catalog = {
  "authors": [
    {
      "handle": "wrc_jungle",
      "display": "Маршрут · редакция",
      "bio": "Редакционный автор WrCommunity. Разбираем маршруты лесника, темп и взаимодействие с линиями. Это материалы команды проекта, а не профиль реального игрока."
    },
    {
      "handle": "wrc_mid",
      "display": "Центр · редакция",
      "bio": "Редакционный автор WrCommunity. Разговоры о миде, приоритете линии и решениях на карте. Это материалы команды проекта, а не профиль реального игрока."
    },
    {
      "handle": "wrc_support",
      "display": "Связка · редакция",
      "bio": "Редакционный автор WrCommunity. Здесь — игра вдвоём, саппорт, вижен и командные решения. Это материалы команды проекта, а не профиль реального игрока."
    },
    {
      "handle": "wrc_macro",
      "display": "Темп · редакция",
      "bio": "Редакционный автор WrCommunity. Обсуждаем макро, объекты и то, как выигрывать матч решениями, а не только драками. Это материалы команды проекта, а не профиль реального игрока."
    },
    {
      "handle": "wrc_team",
      "display": "Штаб · редакция",
      "bio": "Официальная редакция WrCommunity. Публикуем вопросы недели, правила площадки и темы для сообщества. Здесь не изображают реальных участников."
    }
  ],
  "clubs": [
    {
      "slug": "between-matches",
      "name": "Между матчами",
      "description": "Место для спокойного общения после каток: вопросы, истории, игровые привычки и впечатления. Редакционный клуб WrCommunity — вход открыт.",
      "owner": "wrc_team",
      "rules": "Обсуждаем игру и опыт без перехода на личности. Не публикуем чужие контакты и приватные данные."
    },
    {
      "slug": "jungle-lab",
      "name": "Разбор леса",
      "description": "Маршруты, тайминги, контроль объектов и сложные решения в лесу. Редакционный клуб WrCommunity для разбора игровых ситуаций.",
      "owner": "wrc_jungle",
      "rules": "Не высмеиваем игроков за ранг. Сначала обсуждаем контекст, потом спорим о решении."
    },
    {
      "slug": "mid-macro",
      "name": "Мид и макро",
      "description": "Приоритет на линии, роумы, карта и командные решения. Редакционный клуб WrCommunity: учимся видеть игру шире своей линии.",
      "owner": "wrc_mid",
      "rules": "Конструктивные разборы без оскорблений. Спойлеры к матчам помечаем в тексте."
    }
  ],
  "posts": [
    {
      "slug": "route-first",
      "by": "wrc_jungle",
      "tags": [
        "лес",
        "макро"
      ],
      "body": "Как выбираете первый маршрут в лесу?\n\nУниверсального старта нет: важны линии, возможная ранняя стычка и то, где появится первый шанс на давление. Перед выходом с базы я смотрю не только на своего чемпиона, но и на пару самых уязвимых линий.\n\nЧто для вас важнее в начале матча — гарантированный фарм или шанс помочь линии?"
    },
    {
      "slug": "route-scuttle",
      "by": "wrc_jungle",
      "tags": [
        "лес",
        "объекты"
      ],
      "body": "Речной краб не стоит потерянной игры.\n\nИногда лучше уступить один ранний ресурс, если у соперника есть приоритет на двух соседних линиях. Решение зависит от того, кто успеет подойти и что можно забрать на другой стороне карты.\n\nБывало, что отказ от драки за краба спасал вам темп?"
    },
    {
      "slug": "route-pings",
      "by": "wrc_jungle",
      "tags": [
        "лес",
        "команда"
      ],
      "body": "Один понятный пинг полезнее пяти сердитых.\n\nПеред заходом на линию полезно заранее показать маршрут и дать союзнику время подготовиться. Если волна плохая, лучше не навязывать ганк только потому, что уже подошёл.\n\nКакой сигнал от лесника вам действительно помогает?"
    },
    {
      "slug": "mid-wave",
      "by": "wrc_mid",
      "tags": [
        "мид",
        "линия"
      ],
      "body": "Приоритет на миде — это не всегда про урон по башне.\n\nБыстро обработанная волна даёт секунды на обзор реки, помощь леснику или безопасное возвращение за предметом. Иногда правильный ход — не бежать в драку, а сначала решить вопрос с миньонами.\n\nПо какому признаку понимаете, что пора выходить с линии?"
    },
    {
      "slug": "mid-roam",
      "by": "wrc_mid",
      "tags": [
        "мид",
        "макро"
      ],
      "body": "Роум без плана может отдать больше, чем принести.\n\nПеред выходом оцениваю положение волны, путь к цели и возможность вернуться. Удачный роум — не обязательно убийство; иногда достаточно дать союзникам пространство или увидеть соперника первым.\n\nКогда предпочитаете остаться на миде?"
    },
    {
      "slug": "mid-matchup",
      "by": "wrc_mid",
      "tags": [
        "мид",
        "обсуждение"
      ],
      "body": "Как вы учите неудобные матчапы?\n\nМне помогает разбирать первые три волны отдельно от остальной игры: где можно подойти к крипам, какой кулдаун нужно уважать и при каких условиях выгоден обмен.\n\nЕсть матчап, который сначала казался невозможным, а потом стал понятным?"
    },
    {
      "slug": "support-space",
      "by": "wrc_support",
      "tags": [
        "саппорт",
        "дуо"
      ],
      "body": "Хороший саппорт создаёт пространство даже без красивого счёта.\n\nИногда ценнее отвести давление от стрелка, прикрыть отход или вовремя проверить подход к реке. Это действия, которые плохо отражаются в статистике, но очень заметны в самой игре.\n\nЗа что вы цените своего напарника на линии?"
    },
    {
      "slug": "support-vision",
      "by": "wrc_support",
      "tags": [
        "саппорт",
        "вижен"
      ],
      "body": "Обзор карты начинается с вопроса: что мы хотим сделать дальше?\n\nВард без плана полезен меньше, чем обзор вокруг ближайшего объекта или маршрута отхода. Лучше поставить его чуть раньше и иметь возможность уйти, чем рисковать ради последней секунды.\n\nКакие места для вижена считаете самыми недооценёнными?"
    },
    {
      "slug": "support-duo",
      "by": "wrc_support",
      "tags": [
        "дуо",
        "команда"
      ],
      "body": "Идеальное дуо — не обязательно два самых сильных игрока.\n\nКогда люди одинаково понимают, стоит ли драться за волну, уходить от ганка и разменивать ресурсы, играть становится спокойнее. Хорошая коммуникация зачастую важнее громких коллов.\n\nКакие три вещи вы обсуждаете перед первым совместным матчем?"
    },
    {
      "slug": "macro-lose-fight",
      "by": "wrc_macro",
      "tags": [
        "макро",
        "объекты"
      ],
      "body": "Проигранная драка не всегда означает проигранную карту.\n\nЕсли соперник собрался впятером за одной целью, на другой стороне иногда остаются свободная волна, башня или возможность подготовить защиту. Главное — не отдавать следующую цель автоматически.\n\nКогда вы предпочитаете размен вместо повторной драки?"
    },
    {
      "slug": "macro-tower",
      "by": "wrc_macro",
      "tags": [
        "макро",
        "карта"
      ],
      "body": "После взятия башни начинается интересная часть.\n\nОткрывается пространство, меняются безопасные пути и появляется выбор: продолжать давить или перегруппироваться. Часто ошибка — остаться на уже выигранной линии без новой причины.\n\nКак вы принимаете решение о следующем объекте?"
    },
    {
      "slug": "macro-reset",
      "by": "wrc_macro",
      "tags": [
        "макро",
        "темп"
      ],
      "body": "Хороший возврат на базу тоже выигрывает карту.\n\nКогда деньги лежат в инвентаре, а команда собирается к цели, запоздалый закуп может стоить больше, чем ещё одна волна. Мне нравится считать не только золото, но и время на возвращение.\n\nКак вы выбираете момент для ресета перед объектом?"
    },
    {
      "slug": "community-intro",
      "by": "wrc_team",
      "tags": [
        "сообщество",
        "знакомство"
      ],
      "body": "Знакомимся! Кто откуда пришёл во Wild Rift?\n\nРасскажите, на какой роли играете чаще всего, что хотите улучшить и каких людей ищете здесь: дуо, постоянную команду или просто собеседников после матча.\n\nЭта тема подготовлена редакцией WrCommunity, чтобы первым участникам было легче начать разговор."
    },
    {
      "slug": "community-question",
      "by": "wrc_team",
      "tags": [
        "обсуждение",
        "сообщество"
      ],
      "body": "Вопрос недели: какой один совет вы дали бы себе после первых десяти матчей?\n\nНе обязательно рассказывать о сборках. Это может быть решение не спорить в чате, чаще смотреть на миникарту или вовремя заканчивать игровую сессию.\n\nПишите коротко — интереснее собирать разные взгляды."
    },
    {
      "slug": "community-format",
      "by": "wrc_team",
      "tags": [
        "сообщество",
        "идеи"
      ],
      "body": "Каких рубрик вам не хватает на игровых площадках?\n\nИдеи для WrCommunity: еженедельные разборы одной ситуации, подборки вопросов новичков, спокойные дискуссии о ролях, поиск тренировочного дуо.\n\nЧто из этого хочется видеть регулярно? Можно предложить свой формат."
    },
    {
      "slug": "club-between-1",
      "by": "wrc_team",
      "club": "between-matches",
      "tags": [
        "клуб",
        "знакомство"
      ],
      "body": "Добро пожаловать в «Между матчами».\n\nЭто открытый редакционный клуб для разговоров об игре без требований по рангу и статистике. Начните с простого: любимая роль, самый смешной момент недели и одна вещь, которую хотелось бы освоить."
    },
    {
      "slug": "club-between-2",
      "by": "wrc_team",
      "club": "between-matches",
      "tags": [
        "клуб",
        "обсуждение"
      ],
      "body": "Тема на вечер: какой матч запомнился не из-за победы?\n\nИногда самая интересная катка — та, где команда собралась после неудачного старта, кто-то научился новому или просто получилась необычная концовка. Делитесь историями без раскрытия чужих личных данных."
    },
    {
      "slug": "club-between-3",
      "by": "wrc_team",
      "club": "between-matches",
      "tags": [
        "клуб",
        "идеи"
      ],
      "body": "Собираем идеи для клуба.\n\nХотите обсуждения матчей по ролям, короткие текстовые разборы, тематические встречи или подборку игровых привычек? Напишите, какой формат помог бы чаще возвращаться сюда."
    },
    {
      "slug": "club-jungle-1",
      "by": "wrc_jungle",
      "club": "jungle-lab",
      "tags": [
        "лес",
        "маршрут"
      ],
      "body": "Разбор ситуации №1: две линии просят ганк одновременно.\n\nНа одной соперник сильно выдвинут, на другой союзник проигрывает волну. Как решаете, куда идти: шанс на результат, близость к объекту или возможность безопасно отступить?\n\nВажно объяснить логику, а не только назвать линию."
    },
    {
      "slug": "club-jungle-2",
      "by": "wrc_jungle",
      "club": "jungle-lab",
      "tags": [
        "лес",
        "объекты"
      ],
      "body": "Упражнение для лесника: перед каждым объектом ответьте себе на три вопроса.\n\nКто может прийти первым? Какие линии могут потерять волну? Что берём, если решаем не драться?\n\nКакие вопросы добавили бы в этот список?"
    },
    {
      "slug": "club-jungle-3",
      "by": "wrc_jungle",
      "club": "jungle-lab",
      "tags": [
        "лес",
        "гайды"
      ],
      "body": "Что сложнее всего объяснить начинающему леснику?\n\nМаршруты можно запомнить. Гораздо труднее почувствовать, когда нужно прервать фарм, не идти на рискованный ганк и разменять объект. Давайте соберём примеры конкретных решений."
    },
    {
      "slug": "club-mid-1",
      "by": "wrc_mid",
      "club": "mid-macro",
      "tags": [
        "мид",
        "волна"
      ],
      "body": "Практика: смотрим на волну перед роумом.\n\nЕсли уходить в момент, когда соперник быстро пушит, можно вернуться к потерянному золоту и башне. Предлагаю в этой теме обсуждать ситуации «стоит ли выходить?» и объяснять почему."
    },
    {
      "slug": "club-mid-2",
      "by": "wrc_mid",
      "club": "mid-macro",
      "tags": [
        "макро",
        "карта"
      ],
      "body": "Короткий чек-лист перед дракой за объект.\n\nГде ближайшие волны? Кто виден на карте? Есть ли у команды время на закуп и обзор? Могут ли противники прийти с неожиданной стороны?\n\nКакой пункт чаще всего забывают в соло-очереди?"
    },
    {
      "slug": "club-mid-3",
      "by": "wrc_mid",
      "club": "mid-macro",
      "tags": [
        "мид",
        "команда"
      ],
      "body": "Идеи для совместных разборов.\n\nМожно публиковать текстовое описание игровой ситуации: время матча, положение волн, доступные цели и два возможных решения. Другие участники предлагают свой план без оценки ранга автора."
    }
  ]
};
export const SEED_VERSION = 'wrcommunity-editorial-v1';
export const EDITORIAL_PASSWORD_HASH = '!wrc-editorial-no-login-v1';
export const EDITORIAL_BIO_PREFIX = 'Редакционный';

export function stableId(kind, key) {
  const hash = createHash('sha256').update('wrcommunity:editorial:v1:' + kind + ':' + key).digest('hex');
  return hash.slice(0,8) + '-' + hash.slice(8,12) + '-4' + hash.slice(13,16) + '-a' + hash.slice(17,20) + '-' + hash.slice(20,32);
}
export function editorialEmail(handle) {return handle + '@example.invalid';}
export function validateCatalog() {
  const {authors,clubs,posts} = catalog;
  const fail = message => {throw new Error('Invalid editorial catalog: ' + message);};
  if (authors.length !== 5 || clubs.length !== 3 || posts.length !== 24) fail('unexpected catalog counts');
  const handles = new Set(), clubSlugs = new Set(), postSlugs = new Set();
  for (const a of authors) {
    if (!/^wrc_[a-z]{3,20}$/.test(a.handle) || handles.has(a.handle)) fail('invalid/duplicate handle');
    if (!a.bio.startsWith(EDITORIAL_BIO_PREFIX) && !a.bio.startsWith('Официальная редакция')) fail('missing disclosure');
    if (!a.display.includes('редакция') || a.bio.length < 80) fail('editorial identity unclear');
    handles.add(a.handle);
  }
  for (const c of clubs) {
    if (clubSlugs.has(c.slug) || !handles.has(c.owner) || c.description.length < 20) fail('club mismatch');
    clubSlugs.add(c.slug);
  }
  for (const p of posts) {
    if (postSlugs.has(p.slug) || !handles.has(p.by) || (p.club && !clubSlugs.has(p.club))) fail('post mismatch');
    if (!p.body.trim() || [...p.body].length > 5000 || p.tags.length > 10 || p.tags.some(t => t.length < 1 || t.length > 32)) fail('bad post size');
    if (!p.body.includes('\n') || p.body.length < 100) fail('post lacks substance');
    postSlugs.add(p.slug);
  }
  return {authors:authors.length,clubs:clubs.length,posts:posts.length};
}
async function requireKnownUser(client, author) {
  const id=stableId('author',author.handle), email=editorialEmail(author.handle);
  const found=await client.query('SELECT id,handle,email,password_hash,biography FROM users WHERE id=$1 OR handle=$2 OR email=$3',[id,author.handle,email]);
  if (found.rows.length>1) throw new Error('Editorial identity collision: ' + author.handle);
  const row=found.rows[0];
  if (row && (row.id!==id || row.handle!==author.handle || row.email!==email || row.password_hash!==EDITORIAL_PASSWORD_HASH || !(row.biography||'').includes('WrCommunity'))) throw new Error('Existing user is not our editorial account: ' + author.handle);
  if (!row) {
    await client.query("INSERT INTO users(id,email,password_hash,handle,display_name,visibility,biography,game,online_opt_in,platform_role,status,verified_at) VALUES($1,$2,$3,$4,$5,'public',$6,'{}'::jsonb,false,'member','active',NULL)",[id,email,EDITORIAL_PASSWORD_HASH,author.handle,author.display,author.bio]);
    return true;
  }
  return false;
}
async function requireKnownClub(client, club) {
  const id=stableId('club',club.slug), owner=stableId('author',club.owner);
  const found=await client.query('SELECT id,owner_id FROM clubs WHERE id=$1',[id]);
  if (found.rows.length && found.rows[0].owner_id!==owner) throw new Error('Club ID collision: ' + club.slug);
  if (!found.rows.length) {
    await client.query("INSERT INTO clubs(id,owner_id,name,description,join_mode,feed_visibility,rules,state) VALUES($1,$2,$3,$4,'open','public',$5,'active')",[id,owner,club.name,club.description,club.rules]);
  }
  const membership=await client.query('SELECT user_id,role,state FROM club_memberships WHERE club_id=$1 AND user_id=$2',[id,owner]);
  if (membership.rows.length && (membership.rows[0].role!=='owner'||membership.rows[0].state!=='active')) throw new Error('Unexpected club owner membership: ' + club.slug);
  if (!membership.rows.length) {
    const handle=club.owner;
    await client.query("INSERT INTO club_memberships(club_id,user_id,role,state,nickname,nickname_key,consent_version,consented_at,joined_at) VALUES($1,$2,'owner','active',$3,$3,1,now(),now())",[id,owner,handle]);
  }
  const reservation=await client.query('SELECT user_id FROM club_name_reservations WHERE club_id=$1 AND nickname_key=$2',[id,club.owner]);
  if (reservation.rows.length && reservation.rows[0].user_id!==owner) throw new Error('Club nickname conflict: '+club.slug);
  if (!reservation.rows.length) await client.query('INSERT INTO club_name_reservations(club_id,nickname_key,user_id) VALUES($1,$2,$3)',[id,club.owner,owner]);
  return !found.rows.length;
}
async function requireKnownPost(client, post) {
  const id=stableId('post',post.slug), author=stableId('author',post.by), club=post.club?stableId('club',post.club):null;
  const found=await client.query('SELECT author_id,club_id FROM posts WHERE id=$1',[id]);
  if (found.rows.length && (found.rows[0].author_id!==author || (found.rows[0].club_id??null)!==club)) throw new Error('Post ID collision: ' + post.slug);
  if (found.rows.length) return false;
  await client.query("INSERT INTO posts(id,author_id,club_id,state,audience) VALUES($1,$2,$3,'published','public')",[id,author,club]);
  const revision=stableId('revision',post.slug);
  await client.query("INSERT INTO post_revisions(id,post_id,body,images,tags,status,reviewed_at) VALUES($1,$2,$3,'[]'::jsonb,$4::jsonb,'approved',now())",[revision,id,post.body,JSON.stringify(post.tags)]);
  await client.query('UPDATE posts SET current_revision_id=$1 WHERE id=$2',[revision,id]);
  return true;
}
export async function seedEditorialContent(client) {
  validateCatalog();
  const count={created:{authors:0,clubs:0,posts:0},existing:{authors:0,clubs:0,posts:0}};
  await client.query('BEGIN');
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('wrcommunity-editorial-seed-v1',0))");
    for (const a of catalog.authors) count[await requireKnownUser(client,a)?'created':'existing'].authors++;
    for (const c of catalog.clubs) count[await requireKnownClub(client,c)?'created':'existing'].clubs++;
    for (const p of catalog.posts) count[await requireKnownPost(client,p)?'created':'existing'].posts++;
    await client.query('COMMIT');return count;
  } catch (error) {await client.query('ROLLBACK');throw error;}
}
async function main() {
  const args=process.argv.slice(2);
  if (args.length && (args.length!==1 || args[0]!=='--apply')) throw new Error('Usage: node scripts/editorial-seed.mjs [--apply]');
  const plan=validateCatalog();
  if (!args.length) {
    process.stdout.write(JSON.stringify({mode:'preview',version:SEED_VERSION,...plan,no_database_write:true})+'\n');
    return;
  }
  if (!process.env.DATABASE_URL || process.env.NODE_ENV==='test') throw new Error('A configured production DATABASE_URL is required for --apply; tests cannot apply seed');
  const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:1});
  try {const client=await pool.connect();try{const result=await seedEditorialContent(client);process.stdout.write(JSON.stringify({version:SEED_VERSION,...result})+'\n');}finally{client.release();}}
  finally{await pool.end();}
}
if (process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1]) main().catch(error=>{process.stderr.write(String(error.message||error)+'\n');process.exitCode=1;});
