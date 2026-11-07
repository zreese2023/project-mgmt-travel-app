-- Wayfarer SAMPLE data: destinations, activities, advisories, flights and hotels.
-- Everything here is fictional or illustrative and is labelled as sample data in the UI.
-- Flights are generated for the next 90 days relative to CURRENT_DATE; re-run `npm run db:init`
-- to refresh them (this also resets the database).

insert into airports (code, name, city, country, is_origin) values
  ('JFK', 'John F. Kennedy International', 'New York', 'United States', true),
  ('LAX', 'Los Angeles International', 'Los Angeles', 'United States', true),
  ('ORD', 'O''Hare International', 'Chicago', 'United States', true),
  ('ATL', 'Hartsfield-Jackson Atlanta International', 'Atlanta', 'United States', true),
  ('NRT', 'Narita International', 'Tokyo', 'Japan', false),
  ('CDG', 'Charles de Gaulle', 'Paris', 'France', false),
  ('LHR', 'Heathrow', 'London', 'United Kingdom', false),
  ('FCO', 'Leonardo da Vinci-Fiumicino', 'Rome', 'Italy', false),
  ('BCN', 'Barcelona-El Prat', 'Barcelona', 'Spain', false),
  ('KEF', 'Keflavik International', 'Reykjavik', 'Iceland', false),
  ('BKK', 'Suvarnabhumi', 'Bangkok', 'Thailand', false),
  ('SYD', 'Sydney Kingsford Smith', 'Sydney', 'Australia', false),
  ('CPT', 'Cape Town International', 'Cape Town', 'South Africa', false),
  ('GIG', 'Rio de Janeiro-Galeao', 'Rio de Janeiro', 'Brazil', false),
  ('DXB', 'Dubai International', 'Dubai', 'United Arab Emirates', false),
  ('HNL', 'Daniel K. Inouye International', 'Honolulu', 'United States', false),
  ('CUN', 'Cancun International', 'Cancun', 'Mexico', false),
  ('RAK', 'Marrakech Menara', 'Marrakech', 'Morocco', false);

insert into destinations (slug, name, country, region, description, image_url, avg_daily_cost, interests, latitude, longitude, airport_code) values
  ('tokyo', 'Tokyo', 'Japan', 'Asia',
   'Japan''s capital blends neon-lit districts with quiet shrines and some of the best food in the world. Efficient trains make it easy to cover a lot in a few days.',
   '/img/destinations/tokyo.svg', 210, array['culture','food','nightlife','shopping'], 35.68950, 139.69170, 'NRT'),
  ('paris', 'Paris', 'France', 'Europe',
   'The city of art, cafes and long riverside walks. Museums, bakeries and grand boulevards make it a classic first European trip.',
   '/img/destinations/paris.svg', 240, array['culture','food','history','shopping'], 48.85660, 2.35220, 'CDG'),
  ('london', 'London', 'United Kingdom', 'Europe',
   'A huge, diverse city of royal history, free museums, theatre and markets. Every neighbourhood feels like a different town.',
   '/img/destinations/london.svg', 255, array['culture','history','nightlife','shopping'], 51.50740, -0.12780, 'LHR'),
  ('rome', 'Rome', 'Italy', 'Europe',
   'Ancient ruins, baroque fountains and long lunches. History is on every corner and the pasta is reason enough to visit.',
   '/img/destinations/rome.svg', 190, array['history','culture','food'], 41.90280, 12.49640, 'FCO'),
  ('barcelona', 'Barcelona', 'Spain', 'Europe',
   'Gaudi architecture, a city beach and a lively tapas scene. Sunny most of the year and walkable between sights.',
   '/img/destinations/barcelona.svg', 170, array['culture','food','beach','nightlife'], 41.38510, 2.17340, 'BCN'),
  ('reykjavik', 'Reykjavik', 'Iceland', 'Europe',
   'A small, colourful capital that is the base for glaciers, geysers and northern lights tours. Pack layers in every season.',
   '/img/destinations/reykjavik.svg', 280, array['nature','adventure'], 64.14660, -21.94260, 'KEF'),
  ('bangkok', 'Bangkok', 'Thailand', 'Asia',
   'Temples, street food and river markets at a friendly price. Hot and busy, with an easy base for trips across Southeast Asia.',
   '/img/destinations/bangkok.svg', 80, array['food','culture','nightlife','shopping'], 13.75630, 100.50180, 'BKK'),
  ('sydney', 'Sydney', 'Australia', 'Oceania',
   'Harbour views, surf beaches and coastal walks. Easy to combine city sights with a day by the ocean.',
   '/img/destinations/sydney.svg', 230, array['beach','nature','food','adventure'], -33.86880, 151.20930, 'SYD'),
  ('cape-town', 'Cape Town', 'South Africa', 'Africa',
   'Table Mountain over a coastline of beaches, vineyards and penguins. Excellent value for scenery and food.',
   '/img/destinations/cape-town.svg', 110, array['nature','adventure','food','beach'], -33.92490, 18.42410, 'CPT'),
  ('rio-de-janeiro', 'Rio de Janeiro', 'Brazil', 'South America',
   'Copacabana, Sugarloaf Mountain and samba on the street. A beach city with jungle-covered peaks right behind it.',
   '/img/destinations/rio-de-janeiro.svg', 95, array['beach','nightlife','nature','culture'], -22.90680, -43.17290, 'GIG'),
  ('dubai', 'Dubai', 'United Arab Emirates', 'Middle East',
   'Record-breaking towers, desert safaris and huge malls. Best visited in the cooler months.',
   '/img/destinations/dubai.svg', 270, array['shopping','adventure','food'], 25.20480, 55.27080, 'DXB'),
  ('honolulu', 'Honolulu', 'United States', 'North America',
   'Waikiki beach, volcanic hikes and Hawaiian food on Oahu. Relaxed and easy to reach from the US mainland.',
   '/img/destinations/honolulu.svg', 250, array['beach','nature','adventure'], 21.30690, -157.85830, 'HNL'),
  ('cancun', 'Cancun', 'Mexico', 'North America',
   'Turquoise Caribbean water and nearby Mayan ruins. A short flight from most of the US, with options from budget to resort.',
   '/img/destinations/cancun.svg', 150, array['beach','history','nightlife'], 21.16190, -86.85150, 'CUN'),
  ('marrakech', 'Marrakech', 'Morocco', 'Africa',
   'Souks, riads and the Jemaa el-Fnaa square at night. A sensory city with the Atlas Mountains an hour away.',
   '/img/destinations/marrakech.svg', 90, array['culture','history','food','shopping'], 31.62950, -7.98110, 'RAK');

insert into activities (destination_id, name, category, description, duration_min)
select d.id, a.name, a.category, a.description, a.duration_min
from (values
  ('tokyo', 'Senso-ji Temple', 'culture', 'Walk the market street to Tokyo''s oldest temple.', 120),
  ('tokyo', 'Shibuya Crossing and Sky', 'sightseeing', 'See the famous crossing, then the city from above.', 90),
  ('tokyo', 'Tsukiji Outer Market Food Tour', 'food', 'Sample sushi, tamagoyaki and street snacks.', 150),
  ('tokyo', 'Meiji Shrine and Harajuku', 'culture', 'A forest shrine followed by youth fashion streets.', 180),
  ('paris', 'Louvre Museum', 'culture', 'See the highlights of one of the world''s great museums.', 240),
  ('paris', 'Eiffel Tower at Sunset', 'sightseeing', 'Ride to the top as the lights come on.', 120),
  ('paris', 'Montmartre Walk', 'culture', 'Artists'' square, Sacre-Coeur and hill-top cafes.', 150),
  ('paris', 'Seine River Cruise', 'sightseeing', 'An hour on the water past the main landmarks.', 75),
  ('london', 'British Museum', 'culture', 'Free entry to a huge collection from every era.', 180),
  ('london', 'Tower of London', 'history', 'Crown jewels and nine centuries of history.', 150),
  ('london', 'Borough Market Lunch', 'food', 'Graze through one of the oldest food markets.', 90),
  ('london', 'West End Show', 'nightlife', 'Evening theatre in the heart of the city.', 180),
  ('rome', 'Colosseum and Forum', 'history', 'Walk the arena and the ruins of ancient Rome.', 210),
  ('rome', 'Vatican Museums', 'culture', 'Galleries ending at the Sistine Chapel.', 210),
  ('rome', 'Trastevere Dinner', 'food', 'Cobbled lanes and trattorias across the river.', 120),
  ('rome', 'Trevi Fountain and Piazzas', 'sightseeing', 'An evening walk between the best squares.', 90),
  ('barcelona', 'Sagrada Familia', 'culture', 'Gaudi''s unfinished basilica, inside and out.', 120),
  ('barcelona', 'Park Guell', 'sightseeing', 'Mosaic terraces with views over the city.', 120),
  ('barcelona', 'Tapas Crawl in El Born', 'food', 'Small plates and vermouth across several bars.', 150),
  ('barcelona', 'Barceloneta Beach Afternoon', 'beach', 'Sand, sun and seafood by the sea.', 180),
  ('reykjavik', 'Golden Circle Tour', 'nature', 'Geysers, waterfalls and a rift valley in one day.', 480),
  ('reykjavik', 'Blue Lagoon', 'wellness', 'Soak in a geothermal spa near the airport.', 180),
  ('reykjavik', 'Northern Lights Hunt', 'adventure', 'An evening bus tour chasing the aurora (seasonal).', 240),
  ('reykjavik', 'Hallgrimskirkja Tower', 'sightseeing', 'Panoramic views over the colourful rooftops.', 45),
  ('bangkok', 'Grand Palace and Wat Pho', 'culture', 'Gilded halls and the giant reclining Buddha.', 210),
  ('bangkok', 'Chao Phraya River Boat', 'sightseeing', 'Hop between riverside temples and markets.', 120),
  ('bangkok', 'Street Food in Yaowarat', 'food', 'Chinatown after dark: noodles, grills and sweets.', 150),
  ('bangkok', 'Chatuchak Weekend Market', 'shopping', 'Thousands of stalls, from clothes to plants.', 180),
  ('sydney', 'Opera House and Harbour Bridge', 'sightseeing', 'Circular Quay, a tour and a bridge climb option.', 150),
  ('sydney', 'Bondi to Coogee Coastal Walk', 'nature', 'Cliff-top path past beaches and rock pools.', 180),
  ('sydney', 'Taronga Zoo Ferry', 'nature', 'A ferry across the harbour to see native wildlife.', 240),
  ('sydney', 'Surf Lesson at Manly', 'adventure', 'Beginner-friendly lesson with equipment included.', 120),
  ('cape-town', 'Table Mountain Cable Car', 'nature', 'Ride up for views over the city and ocean.', 150),
  ('cape-town', 'Cape Point and Penguins', 'nature', 'Scenic drive to the peninsula and Boulders Beach.', 420),
  ('cape-town', 'Winelands Tasting', 'food', 'Stellenbosch estates and long lunches.', 360),
  ('cape-town', 'Robben Island Tour', 'history', 'Ferry and guided tour of the historic island.', 270),
  ('rio-de-janeiro', 'Christ the Redeemer', 'sightseeing', 'Train through the forest to the famous statue.', 180),
  ('rio-de-janeiro', 'Sugarloaf Cable Car', 'sightseeing', 'Two peaks and sunset over the bay.', 150),
  ('rio-de-janeiro', 'Copacabana and Ipanema Beach Day', 'beach', 'Sand, juice stands and people-watching.', 240),
  ('rio-de-janeiro', 'Samba Night in Lapa', 'nightlife', 'Live music under the arches.', 180),
  ('dubai', 'Burj Khalifa Observation Deck', 'sightseeing', 'Elevator to the world''s tallest building.', 90),
  ('dubai', 'Desert Safari', 'adventure', 'Dune driving, camel rides and a camp dinner.', 360),
  ('dubai', 'Old Dubai and Gold Souk', 'culture', 'Abra boat across the creek and the spice and gold markets.', 150),
  ('dubai', 'Dubai Mall and Fountain', 'shopping', 'Shopping, an aquarium and the evening fountain show.', 180),
  ('honolulu', 'Diamond Head Hike', 'nature', 'A short climb to a crater-rim view of Waikiki.', 150),
  ('honolulu', 'Pearl Harbor Memorial', 'history', 'Museums and the USS Arizona Memorial.', 240),
  ('honolulu', 'Waikiki Surf Lesson', 'adventure', 'Gentle waves ideal for beginners.', 120),
  ('honolulu', 'North Shore Food Trucks', 'food', 'Shrimp plates, shave ice and beaches on the drive.', 300),
  ('cancun', 'Chichen Itza Day Trip', 'history', 'Mayan pyramid with a cenote swim on the way back.', 600),
  ('cancun', 'Isla Mujeres Boat Trip', 'beach', 'Snorkelling and a lazy beach lunch.', 360),
  ('cancun', 'Cenote Swim', 'nature', 'Cool off in a freshwater sinkhole.', 180),
  ('cancun', 'Hotel Zone Nightlife', 'nightlife', 'Clubs and beach bars along the strip.', 240),
  ('marrakech', 'Jemaa el-Fnaa Evening', 'culture', 'Storytellers, snake charmers and food stalls at dusk.', 150),
  ('marrakech', 'Majorelle Garden', 'sightseeing', 'Cobalt-blue villa and cactus garden.', 90),
  ('marrakech', 'Souk Shopping Walk', 'shopping', 'Lanterns, leather and spices in the medina.', 180),
  ('marrakech', 'Atlas Mountains Day Trip', 'adventure', 'Berber villages and waterfalls.', 540)
) as a(slug, name, category, description, duration_min)
join destinations d on d.slug = a.slug;

-- FALLBACK advisories, shown only when the live U.S. State Department feed cannot be reached.
-- Levels are ILLUSTRATIVE and made up; they are not real travel guidance.
insert into advisories (destination_id, level, summary, categories)
select d.id, a.level, a.summary, a.categories
from (values
  ('tokyo', 1, 'Sample advisory: normal precautions. Check entry requirements before you travel.', array['entry']),
  ('paris', 2, 'Sample advisory: increased caution in crowded tourist areas because of petty theft.', array['safety']),
  ('london', 1, 'Sample advisory: normal precautions.', array['safety']),
  ('rome', 1, 'Sample advisory: normal precautions. Watch for pickpockets near major sights.', array['safety']),
  ('barcelona', 2, 'Sample advisory: increased caution for pickpocketing, especially on public transport.', array['safety']),
  ('reykjavik', 1, 'Sample advisory: normal precautions. Weather can change quickly; check road and aurora forecasts.', array['weather']),
  ('bangkok', 2, 'Sample advisory: increased caution. Drink only bottled water and check current health notices.', array['health','safety']),
  ('sydney', 1, 'Sample advisory: normal precautions. Obey beach flags and lifeguard instructions.', array['safety']),
  ('cape-town', 2, 'Sample advisory: increased caution after dark and when hiking alone.', array['safety']),
  ('rio-de-janeiro', 3, 'Sample advisory: reconsider non-essential travel to some districts; stay in well-known areas.', array['safety']),
  ('dubai', 2, 'Sample advisory: increased caution. Strict local laws apply; extreme summer heat.', array['entry','health']),
  ('honolulu', 1, 'Sample advisory: normal precautions. Respect ocean conditions and hiking closures.', array['safety']),
  ('cancun', 2, 'Sample advisory: increased caution. Stay in resort areas and use licensed transport.', array['safety']),
  ('marrakech', 2, 'Sample advisory: increased caution. Agree taxi prices in advance; dress modestly.', array['entry','safety'])
) as a(slug, level, summary, categories)
join destinations d on d.slug = a.slug;

-- Three hotels per destination, each with three room types. Prices scale with the
-- destination's average daily cost so budget cities have cheaper rooms.
insert into hotels (destination_id, name, rating, amenities, address, image_url)
select d.id, d.name || ' ' || t.suffix, t.rating, t.amenities, t.street || ', ' || d.name, d.image_url
from destinations d
cross join (values
  ('Grand Hotel', 4.6, array['wifi','pool','spa','gym','breakfast'], '1 Central Plaza'),
  ('Boutique Inn', 4.2, array['wifi','breakfast','bar'], '24 Old Town Lane'),
  ('Budget Stay', 3.4, array['wifi'], '88 Station Road')
) as t(suffix, rating, amenities, street);

insert into room_types (hotel_id, name, capacity, nightly_price)
select h.id, r.name, r.capacity,
       round((d.avg_daily_cost * 0.45 * (h.rating / 4.0) * r.factor)::numeric, 2)
from hotels h
join destinations d on d.id = h.destination_id
cross join (values
  ('Standard Room', 2, 1.00),
  ('Deluxe Room', 3, 1.35),
  ('Suite', 4, 2.10)
) as r(name, capacity, factor);

-- Flights: every origin hub to every destination and back, two departures a day for 90 days.
insert into flights (flight_no, airline, origin_code, dest_code, depart_at, arrive_at, price, seats_available, stops, status)
select q.code || (100 + abs(hashtext(q.origin || q.dest || q.code)) % 900)::text,
       q.airline, q.origin, q.dest, q.depart_at,
       q.depart_at + make_interval(mins => (q.hours * 60)::int + q.stops * 90),
       round((q.base * q.price_factor * (0.9 + ((q.n * 7 + abs(hashtext(q.origin || q.dest))) % 25) / 100.0))::numeric, 2),
       12 + abs(hashtext(q.origin || q.dest || q.n::text || q.code)) % 70,
       q.stops,
       'on_time'
from (
  select l.origin, l.dest, l.hours, l.base, d.n, s.code, s.airline, s.price_factor,
         ((current_date + d.n) + s.dep) at time zone 'UTC' as depart_at,
         case when l.hours > 10 and s.code = 'MA' then 1 else 0 end as stops
  from (
    select o.code as origin, r.airport as dest, r.hours, r.base
    from airports o cross join (values
      ('NRT', 14, 900), ('CDG', 8, 620), ('LHR', 7.5, 580), ('FCO', 9, 640), ('BCN', 8.5, 600),
      ('KEF', 6, 480), ('BKK', 20, 1050), ('SYD', 21, 1250), ('CPT', 18, 1100), ('GIG', 10, 780),
      ('DXB', 14, 950), ('HNL', 7, 520), ('CUN', 4, 340), ('RAK', 9, 700)
    ) as r(airport, hours, base)
    where o.is_origin
    union all
    select r.airport, o.code, r.hours, r.base
    from airports o cross join (values
      ('NRT', 14, 900), ('CDG', 8, 620), ('LHR', 7.5, 580), ('FCO', 9, 640), ('BCN', 8.5, 600),
      ('KEF', 6, 480), ('BKK', 20, 1050), ('SYD', 21, 1250), ('CPT', 18, 1100), ('GIG', 10, 780),
      ('DXB', 14, 950), ('HNL', 7, 520), ('CUN', 4, 340), ('RAK', 9, 700)
    ) as r(airport, hours, base)
    where o.is_origin
  ) l
  cross join generate_series(1, 90) as d(n)
  cross join (values
    ('08:15'::time, 'Skyline Air', 'SK', 1.00),
    ('17:40'::time, 'Meridian Airways', 'MA', 0.92)
  ) as s(dep, airline, code, price_factor)
) q;

-- A few flights are delayed or cancelled so flight-status alerts can be demonstrated. Only the
-- evening flight (MA) can be cancelled, so every route and day keeps at least one flight that
-- can still be selected.
update flights set status = case
  when abs(hashtext(flight_no || depart_at::text)) % 100 < 5 then 'delayed'
  when flight_no like 'MA%' and abs(hashtext(flight_no || depart_at::text)) % 100 < 7 then 'cancelled'
  else status
end;
