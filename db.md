@startuml

hide methods
hide stereotypes
skinparam linetype ortho

' =========================
' ENUM NOTES
' =========================

note "user_role\n- WORKER\n- MANAGER\n- ADMIN\n- SUPER_MANAGER" as N1

note "purchase_order_status\n- DRAFT\n- GENERATED\n- SENT\n- ACKNOWLEDGED\n- CANCELLED" as N3

note "schedule_type\n- DAILY\n- WEEKLY" as N4

' =========================
' USERS
' =========================

entity "users" as users {
    *id : UUID <<PK>>
    --
    full_name : varchar
    email : varchar <<UNIQUE>>
    password_hash : text
    role : user_role
    is_active : boolean
    created_at : timestamp
    updated_at : timestamp
}

' =========================
' LOCATIONS
' =========================

entity "locations" as locations {
    *id : UUID <<PK>>
    --
    name : varchar <<UNIQUE>>
    address : text
    created_at : timestamp
}

entity "user_locations" as user_locations {
    *user_id : UUID <<FK>>
    *location_id : UUID <<FK>>
}

users ||--o{ user_locations
locations ||--o{ user_locations

' =========================
' DEPARTMENTS
' =========================

entity "departments" as departments {
    *id : UUID <<PK>>
    --
    code : varchar
    full_name : varchar
}

entity "location_departments" as location_departments {
    *location_id : UUID <<FK>>
    *department_id : UUID <<FK>>
}

locations ||--o{ location_departments
departments ||--o{ location_departments

' =========================
' VENDORS
' =========================

entity "vendors" as vendors {
    *id : UUID <<PK>>
    --
    display_name : varchar
    channel_name : varchar
    email : text
    address1 : text
    address2 : text
    address3 : text
    phone : varchar
    department_id : UUID <<FK>>
    created_at : timestamp
}

departments ||--o{ vendors

' =========================
' ITEMS
' =========================

entity "items" as items {
    *id : UUID <<PK>>
    --
    vendor_id : UUID <<FK>>
    display_name : varchar
    base_unit_name : varchar
    display_unit_name : varchar
    multiplier : numeric
    is_active : boolean
    created_at : timestamp
}

vendors ||--o{ items

' =========================
' LOCATION ITEMS
' =========================

entity "location_items" as location_items {
    *id : UUID <<PK>>
    --
    location_id : UUID <<FK>>
    item_id : UUID <<FK>>
    par_level : numeric
    display_order : integer
    is_active : boolean
}

locations ||--o{ location_items
items ||--o{ location_items

' =========================
' STOCK RECORDS
' =========================

entity "stock_records" as stock_records {
    *id : UUID <<PK>>
    --
    location_id : UUID <<FK>>
    submitted_by : UUID <<FK>>
    slack_message_ts : varchar
    submitted_at : timestamp
    approved_at : timestamp
}

locations ||--o{ stock_records
users ||--o{ stock_records : submitted_by
users ||--o{ stock_records : approved_by

' =========================
' STOCK RECORD ITEMS
' =========================

entity "stock_record_items" as stock_record_items {
    *id : UUID <<PK>>
    --
    stock_record_id : UUID <<FK>>
    item_id : UUID <<FK>>
    entered_quantity : numeric
    entered_unit : varchar
    normalized_quantity : numeric
    created_at : timestamp
}

stock_records ||--o{ stock_record_items
items ||--o{ stock_record_items

' =========================
' PURCHASE ORDERS
' =========================

entity "purchase_orders" as purchase_orders {
    *id : UUID <<PK>>
    --
    vendor_id : UUID <<FK>>
    location_id : UUID <<FK>>
    stock_record_id : UUID <<FK>>
    created_by : UUID <<FK>>
    approved_by : UUID <<FK>>
    status : purchase_order_status
    pdf_url : text
    slack_message_ts : varchar
    notes : text
    created_at : timestamp
    approved_at : timestamp
}

vendors ||--o{ purchase_orders
locations ||--o{ purchase_orders
stock_records ||--o{ purchase_orders
users ||--o{ purchase_orders : created_by
users ||--o{ purchase_orders : approved_by

' =========================
' PURCHASE ORDER ITEMS
' =========================

entity "purchase_order_items" as purchase_order_items {
    *id : UUID <<PK>>
    --
    purchase_order_id : UUID <<FK>>
    item_id : UUID <<FK>>
    quantity : numeric
    unit_name : varchar
    created_at : timestamp
}

purchase_orders ||--o{ purchase_order_items
items ||--o{ purchase_order_items

' =========================
' SCHEDULES
' =========================

entity "schedules" as schedules {
    *id : UUID <<PK>>
    --
    location_id : UUID <<FK>>
    vendor_id : UUID <<FK>>
    schedule_type : schedule_type
    day_of_week : integer
    trigger_time : time
    slack_channel : varchar
    is_active : boolean
    created_at : timestamp
}

locations ||--o{ schedules
vendors ||--o{ schedules


' =========================
' TRANSLATIONS
' =========================

entity "translations" as translations {
    *id : UUID <<PK>>
    --
    source_text : text
    translated_text : text
    source_language : varchar
    target_language : varchar
}



@enduml