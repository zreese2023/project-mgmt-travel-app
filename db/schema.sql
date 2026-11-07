-- Wayfarer schema (PostgreSQL 16), Sprint 1 scope: accounts, destinations, flights, hotels,
-- advisories and itineraries. Money is numeric(10,2) (parsed to number by the server); dates are
-- `date`, instants `timestamptz`. All flight, hotel and advisory rows are SAMPLE data.

create table users (
  id            integer generated always as identity primary key,
  email         text not null unique,
  password_hash text not null,
  name          text not null,
  role          text not null default 'user' check (role in ('user', 'admin')),
  created_at    timestamptz not null default now()
);

create table airports (
  code      text primary key,
  name      text not null,
  city      text not null,
  country   text not null,
  is_origin boolean not null default false -- selectable as a departure city in search
);

create table destinations (
  id             integer generated always as identity primary key,
  slug           text not null unique,
  name           text not null,
  country        text not null,
  region         text not null,
  description    text not null,
  image_url      text not null,
  avg_daily_cost numeric(10,2) not null check (avg_daily_cost >= 0),
  -- 1 under $100/day, 2 under $180, 3 under $260, 4 otherwise (single definition of "budget")
  budget_tier    integer generated always as (
    case when avg_daily_cost < 100 then 1
         when avg_daily_cost < 180 then 2
         when avg_daily_cost < 260 then 3
         else 4 end
  ) stored,
  interests      text[] not null default '{}',
  latitude       numeric(8,5) not null,
  longitude      numeric(8,5) not null,
  airport_code   text not null references airports (code)
);

create table activities (
  id             integer generated always as identity primary key,
  destination_id integer not null references destinations (id) on delete cascade,
  name           text not null,
  category       text not null,
  description    text not null,
  duration_min   integer not null check (duration_min > 0)
);
create index activities_destination_idx on activities (destination_id);

create table flights (
  id              integer generated always as identity primary key,
  flight_no       text not null,
  airline         text not null,
  origin_code     text not null references airports (code),
  dest_code       text not null references airports (code),
  depart_at       timestamptz not null,
  arrive_at       timestamptz not null,
  price           numeric(10,2) not null check (price >= 0), -- per passenger
  seats_available integer not null check (seats_available >= 0),
  stops           integer not null default 0 check (stops >= 0),
  status          text not null default 'on_time' check (status in ('on_time', 'delayed', 'cancelled')),
  check (origin_code <> dest_code),
  check (arrive_at > depart_at)
);
create index flights_route_idx on flights (origin_code, dest_code, depart_at);

create table hotels (
  id             integer generated always as identity primary key,
  destination_id integer not null references destinations (id) on delete cascade,
  name           text not null,
  rating         numeric(2,1) not null check (rating between 1 and 5),
  amenities      text[] not null default '{}',
  address        text not null,
  image_url      text not null
);
create index hotels_destination_idx on hotels (destination_id);

create table room_types (
  id            integer generated always as identity primary key,
  hotel_id      integer not null references hotels (id) on delete cascade,
  name          text not null,
  capacity      integer not null check (capacity > 0),
  nightly_price numeric(10,2) not null check (nightly_price >= 0)
);
create index room_types_hotel_idx on room_types (hotel_id);

-- Made-up FALLBACK advisories (see seed.sql). Live advisories come from the State Department feed.
create table advisories (
  destination_id integer primary key references destinations (id) on delete cascade,
  level          integer not null check (level between 1 and 4),
  summary        text not null,
  categories     text[] not null default '{}',
  source_label   text not null default 'Illustrative sample data, not official guidance'
);

create table trips (
  id             integer generated always as identity primary key,
  user_id        integer not null references users (id) on delete cascade,
  destination_id integer not null references destinations (id),
  name           text not null,
  start_date     date not null,
  end_date       date not null,
  created_at     timestamptz not null default now(),
  check (end_date >= start_date)
);
create index trips_user_idx on trips (user_id);

create table itinerary_items (
  id          integer generated always as identity primary key,
  trip_id     integer not null references trips (id) on delete cascade,
  kind        text not null check (kind in ('flight', 'hotel', 'activity', 'note')),
  title       text not null,
  day         date not null,
  start_time  time,
  position    integer not null default 0,
  notes       text,
  activity_id integer references activities (id),
  flight_id   integer references flights (id),
  hotel_id    integer references hotels (id)
);
create index itinerary_items_trip_idx on itinerary_items (trip_id, day, position);

-- Payments table for tracking trip payments
-- It's just kind of a fake payment though for the
create table payments (
  id        integer generated always as identity primary key,
  trip_id   integer not null references trips (id) on delete restrict,
  amount    numeric(10,2) not null check (amount >= 0),
  method    text not null check (method in ('credit_card', 'debit_card', 'paypal')),
  status    text not null default 'pending' check (status in ('pending', 'completed', 'failed')),
  created_at timestamptz not null default now()
);

create unique index payments_trip_unique_idx on payments (trip_id);

-- In-app alerts (SCRUM-33). `email_outbox` records the SIMULATED email for each alert; nothing is sent.
create table notifications (
  id         integer generated always as identity primary key,
  user_id    integer not null references users (id) on delete cascade,
  type       text not null check (type in ('weather', 'advisory', 'delay')),
  title      text not null,
  body       text not null,
  dedupe_key text not null,
  read_at    timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);
create index notifications_user_idx on notifications (user_id, created_at desc);

create table email_outbox (
  id              integer generated always as identity primary key,
  user_id         integer not null references users (id) on delete cascade,
  notification_id integer references notifications (id) on delete set null,
  to_email        text not null,
  subject         text not null,
  body            text not null,
  created_at      timestamptz not null default now()
);
