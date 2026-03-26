"""
Generate SQL INSERT statements from PSGC CSV file.
Useful for loading data via Supabase Dashboard SQL Editor.

Usage:
    python backend/python/utils/generate_psgc_sql.py
    # Then copy psgc_inserts.sql to Supabase SQL Editor
"""

import csv
from pathlib import Path
import sys

# Get project root
project_root = Path(__file__).parent.parent.parent.parent
csv_path = project_root / 'backend' / 'python' / 'models' / 'PhilippineStandardGeographicCode_Q4_2024.csv'
sql_output = project_root / 'psgc_inserts.sql'

if not csv_path.exists():
    print(f"Error: CSV file not found: {csv_path}")
    sys.exit(1)

print(f"Reading PSGC data from: {csv_path}")
print("Generating SQL INSERT statements...")

record_count = 0
batch_size = 1000  # Insert in batches for better performance

with open(csv_path, 'r', encoding='utf-8') as f, open(sql_output, 'w', encoding='utf-8') as sql_file:
    reader = csv.DictReader(f)
    
    sql_file.write("-- PSGC Data Insert Statements\n")
    sql_file.write("-- Generated from PhilippineStandardGeographicCode_Q4_2024.csv\n")
    sql_file.write("-- Total records will be inserted in batches\n\n")
    
    batch_records = []
    
    for row in reader:
        psgc_code = row['10_Digit_PSGC'].strip()
        name = row['Name'].strip().replace("'", "''")  # Escape single quotes for SQL
        geo_level = row['Geographic_Level'].strip()
        
        if not name or not geo_level:
            continue
        
        # Map geo level to database admin_level
        admin_level_map = {
            'Reg': 'region',
            'Prov': 'province',
            'City': 'city',
            'Mun': 'municipality',
            'Bgy': 'barangay'
        }
        admin_level = admin_level_map.get(geo_level)
        if not admin_level:
            continue
        
        # Extract hierarchy codes from PSGC
        region_code = psgc_code[:2] if len(psgc_code) >= 2 else None
        province_code = psgc_code[2:5] if len(psgc_code) >= 5 else None
        mun_code = psgc_code[5:8] if len(psgc_code) >= 8 else None
        bgy_code = psgc_code[8:10] if len(psgc_code) >= 10 else None
        
        # Parse population
        pop_str = row.get('2020_Population', '').replace(' ', '').replace(',', '').strip()
        population = int(pop_str) if pop_str and pop_str.isdigit() else None
        
        # Build VALUES clause
        values = f"('{name}', '{admin_level}', '{psgc_code}'"
        values += f", '{region_code}'" if region_code else ", NULL"
        values += f", '{province_code}'" if province_code else ", NULL"
        values += f", '{mun_code}'" if mun_code else ", NULL"
        values += f", '{bgy_code}'" if bgy_code else ", NULL"
        values += f", {population if population else 'NULL'}"
        values += ", 'PSGC_Q4_2024')"
        
        batch_records.append(values)
        record_count += 1
        
        # Write batch when full
        if len(batch_records) >= batch_size:
            sql_file.write(f"-- Batch of {len(batch_records)} records\n")
            sql_file.write("INSERT INTO gaia.ph_administrative_boundaries\n")
            sql_file.write("(name, admin_level, psgc_code, region_code, province_code, city_municipality_code, barangay_code, population, source)\n")
            sql_file.write("VALUES\n")
            sql_file.write(",\n".join(batch_records))
            sql_file.write("\nON CONFLICT (psgc_code) DO NOTHING;\n\n")
            batch_records = []
            print(f"  Processed {record_count} records...")
    
    # Write remaining records
    if batch_records:
        sql_file.write(f"-- Final batch of {len(batch_records)} records\n")
        sql_file.write("INSERT INTO gaia.ph_administrative_boundaries\n")
        sql_file.write("(name, admin_level, psgc_code, region_code, province_code, city_municipality_code, barangay_code, population, source)\n")
        sql_file.write("VALUES\n")
        sql_file.write(",\n".join(batch_records))
        sql_file.write("\nON CONFLICT (psgc_code) DO NOTHING;\n\n")

print(f"\n✅ SQL file generated: {sql_output}")
print(f"   Total records: {record_count}")
print(f"\n📋 Next steps:")
print(f"   1. Open Supabase Dashboard → SQL Editor")
print(f"   2. Copy contents of: {sql_output}")
print(f"   3. Paste and run in SQL Editor")
print(f"   4. Verify with: SELECT COUNT(*) FROM gaia.ph_administrative_boundaries;")

