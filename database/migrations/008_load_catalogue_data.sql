-- 008_load_catalogue_data.sql
--
-- The sixteen paintings and their photographs, as data.
--
-- WHAT THIS IS, AND WHY IT IS UNUSUAL
--
-- Every other file in this folder changes the SHAPE of the database. This one
-- changes its CONTENTS, and that is a deliberate exception rather than the new
-- house rule. It exists so that a fresh Neon database can be brought to exactly
-- the catalogue the local database holds, with the migrations rather than
-- beside them, and so that the catalogue is backed up in version control.
--
-- The alternative, and still the better tool when both databases are live, is
--     pg_dump --data-only --table=works --table=work_images
-- taken at the moment of the move. That is current by construction; this file
-- is a snapshot. Both are documented in .claude/rules/deployment.md.
--
-- Generated from the local database on 2026-09-08. It is not hand-maintained:
-- if the catalogue changes, REGENERATE it rather than editing it by hand.
--
-- Where the regenerated copy goes depends on one thing only - whether this file
-- has been applied anywhere yet:
--
--   Not applied to any database (and that is the case today): regenerate IN
--   PLACE. Forward-only exists so that a file which has already run somewhere
--   cannot change underneath it. A file that has never run cannot have that
--   problem, and shipping two data migrations where one would do is worse.
--
--   Applied to any database, Neon included: leave this file alone forever and
--   regenerate into a NEW number. Both upsert on slug_en, so the later one
--   simply wins.
--
-- ENCODING - READ THIS BEFORE RUNNING IT
--
-- Every other migration here is pure ASCII, because psql on Windows defaults
-- its client encoding to WIN1252 and one character without a WIN1252
-- equivalent aborts the statement it sits inside. This file CANNOT be ASCII:
-- the titles, slugs and descriptions are Hebrew, and they are the data.
--
-- So the comments stay ASCII and the data does not, and the file must be run
-- with a UTF-8 client:
--
--     psql:    $env:PGCLIENTENCODING = "UTF8"   (PowerShell, per shell)
--              psql -f 008_load_catalogue_data.sql
--     pgAdmin: unaffected, its query tool is already UTF-8.
--
-- Running it under WIN1252 does not fail cleanly. It aborts mid-statement and
-- then reports errors that point somewhere else entirely.
--
-- WHAT IT DOES NOT DO
--
-- It does not create admin accounts. Those are made by npm run admin:create
-- against the target database, and a password has no business in a file that
-- is committed.
--
-- Safe to run more than once: works upsert on slug_en and images are replaced,
-- all in one transaction. The uuids are written explicitly so that the local
-- database and Neon name the same painting by the same id.

begin;

-- At most one work may be featured (works_single_featured, a unique index over a
-- constant expression restricted to featured rows). Setting the new flag before
-- clearing the old one fails on that index, so the clear comes first and both
-- happen inside this transaction.
update works set featured = false where featured;

insert into works (
  id, slug_he, slug_en, title_he, title_en,
  description_he, description_en, medium,
  width_cm, height_cm, price_agorot, price_reduced_agorot, price_currency,
  year, category, status, sale_channel,
  published_at, featured, has_placeholder_data, added_at
) values
  ('d8d8b56c-e397-4830-b322-3fc84b4201ba', 'קנים-בשקיעה', 'reeds-at-sunset', 'שקיעה זוהרת', 'Glowing Sunset', 'ציור שמן על קנבס שמחזיק רגע עדין של אור אחרון של שקיעה זוהרת מעל מים שקטים וצמחייה. המעברים הרכים בין העננים, הוורודים והסגולים, וההשתקפות הזהובה על פני המים יוצרים נוף רגוע ומלא אווירה, עם תחושת עומק שמזמינה מבט ממושך.', 'An oil on canvas painting that captures a delicate moment of the final light from a glowing sunset over calm water and vegetation. The soft transitions among the clouds, the pinks and purples, and the golden reflection on the water''s surface create a tranquil and atmospheric landscape, with a sense of depth that invites a prolonged gaze.', 'oil-on-canvas', 60.0, 40.0, 190000, null, 'ILS', null, 'landscape', 'available', null, '2026-08-29T21:00:00.000Z', true, false, '2026-08-27'),
  ('d4f16ca4-e41d-4a85-b151-e0a468300598', 'חורשת-עצים', 'tree-grove', 'היער הקטן', 'The Small Forest', 'ציור שמן על קנבס של עצים ביער קטן. 
העצים צבועים בגווני ירוק ועומדים על אדמה חומה. ברקע שמיים כחולים ובהירים המעידים על יום שטוף שמש. הקומפוזיציה מעבירה אווירה שלווה וטבעית, כשהקונטרסט בין הירק השופע, האדמה והחיים לשמיים הבהירים מדגיש תחושת עומק ורוגע', 'An oil on canvas painting of trees in a small wood. 
The trees are rendered in shades of green and stand upon brown earth. In the background, bright blue skies suggest a sun-drenched day. The composition conveys a peaceful and natural atmosphere, whilst the contrast between the lush greenery, the earth and the vibrant life against the clear skies accentuates a sense of depth and calm.', 'oil-on-canvas', 30.0, 30.0, 220000, null, 'ILS', null, 'landscape', 'available', null, '2026-08-13T21:00:00.000Z', false, false, '2026-08-11'),
  ('88cb78e7-1b1e-4938-963c-a50b90bba330', 'בית-טוסקני', 'tuscan-house', 'הבית בכפר', 'The House in the Village', 'ציור שמן על קנבס ממוסגר במסגרת עץ 
בציור מצוירים שני בתים בכפר קטן באווירה שלווה, באור רך של אחר הצהריים. 
הבתים נמוכים ופשוטים, עם קירות עשויים אבן טבעית, וגגות רעפים אדמדמים. החלונות קטנים ומעוטרים בתריסי עץ בצבע תכלת פתוחים .
השבילים בין הבתים צרים ומתפתלים, עשויים אדמה בהירה אשר מסביבם עצי ברוש ירוקים גבוהים ודקים במשחקי אור וצל .', 'Oil on canvas in a wooden frame.
The painting depicts two houses in a small village in a tranquil atmosphere, bathed in soft afternoon light. 
The houses are low and simple, with natural stone walls and reddish-tiled roofs. The windows are small and adorned with open light-blue wooden shutters.
The paths between the houses are narrow and winding, made of light-colored earth and surrounded by tall, slender green cypress trees playing with light and shade.', 'oil-on-canvas', 30.0, 30.0, 278000, null, 'ILS', null, 'landscape', 'sold', null, null, false, false, '2026-08-10'),
  ('e1acee0b-5948-456b-93a9-6dd68819b167', 'ביצה-בשקיעה', 'marsh-at-sunset', 'לפני עלות השחר', 'Before Dawn', 'הציור מציג נוף טבעי בשעת זריחה לפני עלות השחר. 
השמיים צבועים בגוונים רכים של כתום, אפרסק וכחול בהיר, כאילו השמש רק מתחילה לעלות ולהאיר את העננים באור חמים ועדין.

בציור נהר או אגם קטן שמשקף את צבעי השמיים הכתומים, מה שמוסיף תחושת שלווה ורוגע. סביב המים יש צמחייה ירוקה, עם משיכות מכחול רכות שמרמזות על עשבים ושיחים.

ברקע מתנשא אזור מיוער או גבעות כהות יותר בגווני ירוק עמוק וכחול, שיוצרים ניגוד יפה לאור הבהיר של הזריחה. כל הציור מרגיש מעט מטושטש ורך, מה שנותן לו אווירה שלווה', 'The painting depicts a natural landscape at dawn, just before sunrise. The sky is washed in soft hues of orange, peach, and pale blue, as though the sun is only beginning to rise and illuminate the clouds with a warm, gentle light.

Within the painting, a river or small lake mirrors the orange tones of the sky, imparting a sense of peace and tranquillity. The water is edged with green vegetation, rendered in soft brushstrokes that suggest grasses and shrubs.

In the background, a wooded area or darker hills rise in shades of deep green and blue, creating a striking contrast with the bright morning light. The entire composition feels somewhat blurred and soft, lending it a serene atmosphere.', 'oil-on-canvas', 30.0, 30.0, 220000, null, 'ILS', null, 'landscape', 'available', null, '2026-08-11T21:00:00.000Z', false, false, '2026-08-09'),
  ('4a0008b1-da35-421f-ab72-04115959f4ba', 'שער-הגן', 'garden-door', 'הגן הקסום', 'Beyond the Garden Path', 'ציור מקורי בצבעי פסטל, שביל גן בהיר וקסום מתפתל בין צמחייה ירוקה וסבוכה אל דלת עץ מקושתת, כשאשכולות פריחה סגולה ונגיעות אדומות מלווים את הדרך. שכבות הפסטל על הנייר משלבות מעברים רכים של אור וצל עם סימנים חדים יותר בעלווה ובפרחים. המראה האינטימי יוצר אווירה שקטה ומסתורית.', 'Original pastel painting. A bright, enchanting garden path winds through lush, dense foliage towards a arched wooden door, accompanied along the way by clusters of purple blossoms and touches of red. The layers of pastel on paper combine soft transitions of light and shade with sharper marks in the foliage and flowers. The intimate appearance creates a quiet and mysterious atmosphere.', 'pastel-on-paper', 30.0, 40.0, 160000, null, 'ILS', null, 'landscape', 'reserved', null, '2026-08-10T21:00:00.000Z', false, false, '2026-08-08'),
  ('da73fe92-2e49-4986-a096-b9f902bdaa92', 'עץ-סתווי-על-המים', 'autumn-tree-by-water', 'עץ בשלכת על שפת המים', 'Autumn Tree by the Water', 'עץ בצבעי אדום וכתום בשלכת,  ניצב על שפת המים, מול שמיים רכים וקו עצים רחוק ושקט. עבודת הפסטל על נייר מבלטיה את פני המים הבהירים והאוויר הערפילי. הטשטוש העדין והאור החם מעניקים לנוף תחושה מהורהרת וזוהרת בשקט.', 'A tree in red and orange autumn colours stands at the water''s edge, against a soft sky and a distant, quiet treeline. The pastel work on paper highlights the bright surface of the water and the misty air. The delicate blurring and warm light impart a contemplative and quietly luminous feel to the landscape.', 'pastel-on-paper', 30.0, 40.0, 120000, null, 'ILS', null, 'landscape', 'available', null, '2026-08-09T21:00:00.000Z', false, false, '2026-08-07'),
  ('f09a2f0c-46b2-4834-9e74-413b291d2e98', 'שדרת-הצפצפות', 'poplar-path', 'השביל המתפתל בדרך אל הכפר', 'The Way to the Village', 'ציור שמן של טבע באווירה רגועה ושלווה עם תחושה יער כפרי, בציור ניתן לראות שביל עפר מתפתל לתוך הנוף, שבו שורות של עצים מסודרות בקפידה. העצים מצויירים בגוונים משתנים של ירוק וצהוב חלקם ירוקים עמוקים ורעננים, ואחרים נוטים לצהבהב, כאילו השמש נגעה בהם זמן רב או שהעונה מתחילה להשתנות. האור חודר דרך העלים ויוצר כתמים רכים של אור וצל על הקרקע.', 'An oil painting of nature in a calm and tranquil atmosphere with a rustic woodland feel, in which a winding dirt path can be seen leading into the landscape, alongside carefully arranged rows of trees. The trees are painted in varying shades of green and yellow; some are deeply green and fresh, while others lean towards yellowish, as if the sun has touched them for a long time or the season is beginning to change. The light filters through the leaves, creating soft patches of light and shadow on the ground.', 'oil-on-canvas', 30.0, 40.0, 100000, null, 'ILS', null, 'landscape', 'not-for-sale', null, '2026-08-08T21:00:00.000Z', false, false, '2026-08-06'),
  ('5bb21cc6-bfe2-4189-a0ae-dc91fb96afc1', 'בקתה-על-האגם', 'cabin-by-the-lake', 'הבית על החוף', 'The House on the Shore', 'ציור פסטל על נייר מיוחד 
בציור בית כפרי קטן ומקסים בכפר על החוף, מבודד במקצת אך מלא שלווה. הבית עשוי קירות לבנים וחומים, עם גג רעפים אדמדם או חום כהה. הבית עומד על קצה חוף הים,  מסביב לבית צומחים עצים – שילוב של עצי ברוש גבוהים, ועצי מחט או ירוקים אחרים שמוסיפים תחושת טבע.
ברקע נמתחים הרים גבוהים ורכים בקו המתאר שלהם, עם זריחה נפלאה שמוסיפים עומק לנוף 

מי הים כחולים או ירקרקים המשתקפים באור השמש. האווירה כולה שלווה, טבעית ונעימה, כמו מקום שבו הזמן נרגע.

הציור ממוסגר במסגרת מתכת מוזהבת.', 'Pastel on special paper

The painting depicts a charming little cottage in a coastal village, somewhat isolated yet full of tranquility. The house has white and brown walls, with a reddish or dark brown tiled roof. It stands at the water''s edge, surrounded by trees – a combination of tall cypresses and other evergreens or conifers that add a sense of nature. In the background, tall mountains with soft outlines stretch away, accompanied by a wonderful sunrise that adds depth to the landscape.

The sea water is blue or greenish, reflecting the sunlight. The entire atmosphere is peaceful, natural and pleasant, like a place where time slows down.

The painting is framed in a gilded metal frame.', 'pastel-on-paper', 36.0, 50.0, 160000, null, 'ILS', null, 'landscape', 'available', null, '2026-08-07T21:00:00.000Z', false, false, '2026-08-05'),
  ('05279c1b-0d3a-4eb5-8ea7-169a8252bd6b', 'לימונים', 'lemons', 'קערת לימונים', 'Lemons in a Bowl', 'טבע דומם בפסטל על נייר, שבו לימונים שלמים ופלחים חתוכים מסתדרים בקומפוזיציה שקטה ומדויקת. המעברים הרכים, הברק העדין והגוונים המאופקים מעניקים לפרי נוכחות מוחשית  ויוצרים עבודה נעימה עם אופי קלאסי ורעננות ביתית.

הציור ממוסגר עם פספרטו , מסגרת מתכת זהובה.. המידות משתנות עם המסגור בכ-3 סמ מעל צד.', 'Still life in pastel on paper, in which whole lemons and sliced segments are arranged in a quiet, precise composition. The soft transitions, subtle sheen and understated tones lend the fruit a tangible presence, creating a pleasing work with a classic character and domestic freshness.

The painting is framed with a passe-partout and a gold-toned metal frame. Dimensions vary with the framing by approximately 3 cm per side.', 'pastel-on-paper', 30.0, 40.0, 175000, null, 'ILS', null, 'still-life', 'available', null, '2026-08-06T21:00:00.000Z', false, false, '2026-08-04'),
  ('a459bee0-0eba-4af4-8d9b-1f164d1485f2', 'אבטיח-וקנקן', 'watermelon-and-jug', 'אבטיח קיצי', 'Summer Slice', 'פרוסת אבטיח מצוייר בפסטל על נייר עבה, אגרטל מתכתי מבריק עם תותים אדומים,  מפגש יפה בין הברק הקר של כלי המתכת לבין העסיסיות הזוהרת של האבטיח והתותים. המעברים הרכים, ההשתקפויות על המשטח והניגוד בין ירוק, אדום ואפור יוצרים עבודה מזמינה, רעננה ומלאת נוכחות.', 'A slice of watermelon rendered in pastel on heavy paper, a gleaming metallic vase filled with red strawberries—a lovely encounter between the cold sheen of the metal vessel and the luminous juiciness of the watermelon and strawberries. The soft transitions, the reflections on the surface, and the contrast between green, red, and grey create an inviting, fresh work full of presence.', 'pastel-on-paper', 40.0, 30.0, 175000, null, 'ILS', null, 'still-life', 'available', null, '2026-08-05T21:00:00.000Z', false, false, '2026-08-03'),
  ('e898339e-4dff-40aa-a3b4-9068488418e2', 'יין-וענבים', 'wine-and-grapes', 'בקבוק יין בטוסקנה', 'A Bottle of Wine in Tuscany', 'טבע דומם בפסטל על נייר, עם בקבוק יין כהה ואשכול ענבים סגול תחת קשת אבן כפרית. המעברים הרכים והאור המעודן מעניקים לעבודה תחושה קטיפתית ונעימה, והפלטה החמה יוצרת אווירה של מרתף יין אירופי, אינטימי ומזמין, עם ניחוח של אירוח, שפע ורגע של נחת.
ציור בפסטל על נייר עבה איכותי ממוסגר במסגרת מתכת זהובה.', 'A still life in pastel on paper, featuring a dark wine bottle and a bunch of purple grapes beneath a rustic stone arch. The soft transitions and subtle light give the work a velvety, pleasant feel, and the warm palette creates the intimate, inviting atmosphere of a European wine cellar, redolent of hospitality, abundance and a quiet moment of ease.
Pastel painting on high-quality heavy paper, framed in a gold-coloured metal frame.', 'pastel-on-paper', 36.0, 47.0, 250000, null, 'ILS', null, 'still-life', 'sold', null, '2026-08-04T21:00:00.000Z', false, false, '2026-08-02'),
  ('9e46009e-3381-4fd8-9db5-54023e6e6657', 'ורדים-ורודים', 'pink-roses', 'פרחים ורודים באגרטל כחול', 'Pink Flowers in a Blue Vase', 'ציור שמן גדול על קנבס עבה 
 זר פרחים ורודים בתוך אגרטל כחול, על רקע בהיר ועדין. משיכות המכחול החופשיות מעניקות לפרחים תחושת תנועה ורעננות, בעוד שהקומפוזיציה המאוזנת והפלטה המעודנת יוצרות טבע דומם אלגנטי, נעים ומלא חן.', 'Large oil painting on heavy canvas. A bouquet of pink flowers in a blue vase, set against a light and delicate background. The free brushstrokes impart a sense of movement and freshness to the flowers, whilst the balanced composition and refined palette create an elegant, pleasing and graceful still life.', 'oil-on-canvas', 50.0, 70.0, 350000, null, 'ILS', null, 'still-life', 'available', null, '2026-08-03T21:00:00.000Z', false, false, '2026-08-01'),
  ('27627ea4-9167-4bb1-9009-ad02c8462b82', 'שני-אגסים', 'two-pears', 'שני אגסים', 'Two Pears', 'ציור שמן על קנבס,
בציור ניתן לראות שני אגסים מונחים יחד זה לצד זה, בגוונים של ירוק ואדמדמות תוך כדי הדגשת המעברים בין אור וצל , ברק עדין של הקליפה נותן תחושה של עומק, נפח ורכות.', 'Oil on canvas. The painting depicts two pears resting side by side in shades of green and reddish hues, while emphasising the transitions between light and shadow. A subtle sheen on the skin creates a sense of depth, volume, and softness.', 'oil-on-canvas', 30.0, 30.0, 120000, null, 'ILS', null, 'still-life', 'reserved', null, '2026-08-02T21:00:00.000Z', false, false, '2026-07-31'),
  ('5efd99af-c652-4b1a-9fa3-3c0d13b6466f', 'ארטישוקים', 'artichokes', 'ארטישוק', 'Artichoke', 'ציור שמן על קנבס רך ועדין של ארטישוק על כל חלקיו הפנימיים.
במרכז מופיע ארטישוק חצוי: בצד ימין רואים את העלים החיצוניים , המסודרים בשכבות צפופות, עם גוונים של ירוק. בצד שמאל, החלק הפנימי של הארטישוק מוקף טבעות ירקרקות וצהבהבות וסגולות.', 'A soft and delicate oil on canvas painting of an artichoke in all its inner parts.
In the centre appears a halved artichoke: on the right-hand side one sees the outer leaves, arranged in dense layers, with shades of green. On the left-hand side, the inner part of the artichoke is surrounded by greenish, yellowish and purplish rings.', 'oil-on-canvas', 30.0, 30.0, 99000, null, 'ILS', null, 'still-life', 'available', null, '2026-08-01T21:00:00.000Z', false, false, '2026-07-30'),
  ('bb9ec8ea-e364-413d-934c-874608a918b0', 'ויסקי-וכוס', 'whiskey-and-glass', 'נרים כוסית עם ויסקי', 'Cheers with Whisky', 'בקבוק ויסקי וכוס נמוכה עם קוביות קרח  בקומפוזיציית טבע דומם שקטה על רקע חם. הפסטל על נייר יוצר מעברים רכים, קצוות מעט מעושנים והבהובים ענבריים על גבי הזכוכית. הפלטה המצומצמת וההשתקפויות שעל המשטח מעניקות לעבודה אופי אינטימי ונינוח.
הציור ממוסגר במסגרת מתכת זהובה.', 'A whisky bottle and a low tumbler with ice cubes form a quiet still life composition against a warm background. The pastel on paper creates soft transitions, slightly smoky edges, and amber glints across the glass. The restrained palette and the reflections on the surface lend the work an intimate, relaxed character.
The painting is framed in a brushed gold-coloured metal frame.', 'pastel-on-paper', 30.0, 40.0, 170000, null, 'ILS', null, 'still-life', 'not-for-sale', null, '2026-07-31T21:00:00.000Z', false, false, '2026-07-29'),
  ('d85f7d19-5e2e-4180-b426-25eb167d1e23', 'אבוקדו', 'avocado', 'אבוקדו', 'Avocado', 'ציור פסטל על נייר ממוסגר במסגרת מתכת זהובה המתאר חצי אבוקדו חתוך, הממוקם במרכז הקומפוזיציה בגוונים של ירוק-חום.
האבוקדו מואר באור רך שמדגיש את המרקם הקרמי והעשיר של בשר הפרי. הגוון הירוק הבהיר-צהבהב יוצר ניגוד חזק מול הרקע . 
 נמצאת הגלעין החום, עגול ומבריק מעט, שמוסיף עומק ומוקד נוסף לציור.', 'Pastel on paper, framed in a gold-coloured metal frame, depicting a halved avocado positioned at the centre of the composition in shades of green and brown.
The avocado is illuminated by a soft light that highlights the rich, creamy texture of the fruit’s flesh. The pale yellowish-green tone creates a striking contrast against the background.
The brown pit, round and slightly glossy, is present, adding depth and an additional focal point to the painting.', 'pastel-on-paper', 36.0, 47.0, 165000, null, 'ILS', null, 'still-life', 'available', null, null, false, false, '2026-07-28')
on conflict (slug_en) do update set
  slug_he = excluded.slug_he,
  title_he = excluded.title_he,
  title_en = excluded.title_en,
  description_he = excluded.description_he,
  description_en = excluded.description_en,
  medium = excluded.medium,
  width_cm = excluded.width_cm,
  height_cm = excluded.height_cm,
  price_agorot = excluded.price_agorot,
  price_reduced_agorot = excluded.price_reduced_agorot,
  price_currency = excluded.price_currency,
  year = excluded.year,
  category = excluded.category,
  status = excluded.status,
  sale_channel = excluded.sale_channel,
  published_at = excluded.published_at,
  featured = excluded.featured,
  has_placeholder_data = excluded.has_placeholder_data,
  added_at = excluded.added_at,
  updated_at = now();

-- Images are replaced rather than upserted: work_images_one_main is a partial
-- unique index, so a second main row for a work cannot be inserted before the
-- first is gone. Same reasoning as setMainImage in the repository.
delete from work_images
where work_id in (select id from works where slug_en in (
  'reeds-at-sunset',
  'tree-grove',
  'tuscan-house',
  'marsh-at-sunset',
  'garden-door',
  'autumn-tree-by-water',
  'poplar-path',
  'cabin-by-the-lake',
  'lemons',
  'watermelon-and-jug',
  'wine-and-grapes',
  'pink-roses',
  'two-pears',
  'artichokes',
  'whiskey-and-glass',
  'avocado'
));

insert into work_images (
  id, work_id, image_ref, pixel_width, pixel_height, type, position, alt_he, alt_en
) values
  ('81fe1fdb-d2c4-4a5d-8947-46789b8c501d', 'd8d8b56c-e397-4830-b322-3fc84b4201ba', 'https://res.cloudinary.com/kjsom6uz/image/upload/v1788896444/orit-works/ysy77d9kgdaxkneq3r1r.jpg', 1920, 1270, 'main', 0, null, null),
  ('c444113e-10c5-49f9-ad40-eeb0d56b2c75', 'd4f16ca4-e41d-4a85-b151-e0a468300598', 'https://res.cloudinary.com/kjsom6uz/image/upload/v1788896446/orit-works/jnmrpkq4lluincwx0shq.png', 1577, 1600, 'main', 0, null, null),
  ('fb50adf9-50a3-4534-ae70-28d3d646d011', '88cb78e7-1b1e-4938-963c-a50b90bba330', 'https://res.cloudinary.com/kjsom6uz/image/upload/v1788455012/orit-works/nmgvkjnevfmh9lgvewbu.jpg', 1600, 1600, 'main', 0, null, null),
  ('a7618a28-bcd2-4fef-b0d1-6dccf5f8b3ec', 'e1acee0b-5948-456b-93a9-6dd68819b167', 'https://res.cloudinary.com/kjsom6uz/image/upload/v1788896447/orit-works/khkx4kngadvs77okrzrr.png', 1569, 1600, 'main', 0, null, null),
  ('9f6edbe8-5ee4-422d-bffb-cb24e39d5ff3', '4a0008b1-da35-421f-ab72-04115959f4ba', 'https://res.cloudinary.com/kjsom6uz/image/upload/v1788896450/orit-works/n2gytkupuavkgpftxzdm.jpg', 1920, 2875, 'main', 0, null, null),
  ('6e1ce7a8-9863-49f1-be8b-3216bb26a4f2', 'da73fe92-2e49-4986-a096-b9f902bdaa92', 'https://res.cloudinary.com/kjsom6uz/image/upload/v1788896451/orit-works/zajeq6d8fmv4ktrl8dv9.webp', 1206, 1654, 'main', 0, null, null),
  ('67d66193-060e-433a-9882-ff469fe3d9fd', 'f09a2f0c-46b2-4834-9e74-413b291d2e98', 'https://res.cloudinary.com/kjsom6uz/image/upload/v1788896453/orit-works/gao65pleik3ntztos9yz.png', 842, 1071, 'main', 0, null, null),
  ('681716a6-f5d4-4192-a19c-19475ec45fd5', '5bb21cc6-bfe2-4189-a0ae-dc91fb96afc1', 'https://res.cloudinary.com/kjsom6uz/image/upload/v1788896454/orit-works/ofatxrxfo2nyelgyoq14.png', 1206, 1756, 'main', 0, null, null),
  ('525ac91a-b0e1-4267-b6d9-171929f0c632', '05279c1b-0d3a-4eb5-8ea7-169a8252bd6b', 'https://res.cloudinary.com/kjsom6uz/image/upload/v1788896455/orit-works/pduzx8oohk6h6gqsffez.webp', 1114, 1599, 'main', 0, null, null),
  ('53c9876a-a20c-47b4-9ee1-3d7528bfbb9b', 'a459bee0-0eba-4af4-8d9b-1f164d1485f2', 'https://res.cloudinary.com/kjsom6uz/image/upload/v1788896456/orit-works/cgighdhuqw9pn8pvmxok.jpg', 1920, 1305, 'main', 0, null, null),
  ('c83657b2-0fd0-4db4-9a27-060228b79365', 'e898339e-4dff-40aa-a3b4-9068488418e2', 'https://res.cloudinary.com/kjsom6uz/image/upload/v1788896457/orit-works/skdy3pmiaqn2ff012mu7.png', 1043, 1600, 'main', 0, null, null),
  ('d941900d-fd6a-493d-b802-aac03eddbba2', '9e46009e-3381-4fd8-9db5-54023e6e6657', 'https://res.cloudinary.com/kjsom6uz/image/upload/v1788896459/orit-works/vpdh38wsxqsnqhqqng4j.png', 1101, 1600, 'main', 0, null, null),
  ('01bb5d57-dd62-4be3-b336-a2197f61a54b', '27627ea4-9167-4bb1-9009-ad02c8462b82', '/paintings/two-pears.jpg', 1582, 1600, 'main', 0, null, null),
  ('a8b53504-2ffa-4fbf-98bb-75a7a2e5705d', '5efd99af-c652-4b1a-9fa3-3c0d13b6466f', 'https://res.cloudinary.com/kjsom6uz/image/upload/v1788896460/orit-works/hrkds38p9rbdrwozprty.png', 1920, 1893, 'main', 0, null, null),
  ('c9d52b28-4d51-43fc-aadf-6cca10bff45f', 'bb9ec8ea-e364-413d-934c-874608a918b0', 'https://res.cloudinary.com/kjsom6uz/image/upload/v1788896462/orit-works/hj87drwwslpc6j32ouib.jpg', 1920, 2831, 'main', 0, null, null),
  ('9eca7a68-88a0-4f6b-8e10-4cafdd2eee7f', 'd85f7d19-5e2e-4180-b426-25eb167d1e23', 'https://res.cloudinary.com/kjsom6uz/image/upload/v1788896463/orit-works/zter6qpoxmehmwlnnabp.png', 570, 778, 'main', 0, null, null);

commit;
