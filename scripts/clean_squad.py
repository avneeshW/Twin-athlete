import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
import app

conn = app.vault._get_connection()
cur = conn.cursor()

# 1. Remove phantom / test / duplicate Daniel Saji entries
cur.execute("""
    DELETE FROM athlete_baselines
    WHERE athlete_id IN (
        'ATH-9999', 'ATH-1234', 'ATH-STANDBY', 'ATH-5389', 'ATH-6050',
        'ATH-0825', 'ATH-2162', 'ATH-2592', 'ATH-2744'
    )
""")

# 2. Restore ATH-0791 to Mateo Silva
cur.execute("""
    UPDATE athlete_baselines
    SET name = 'Mateo Silva', position = 'Goalkeeper', squad_number = '1'
    WHERE athlete_id = 'ATH-0791'
""")

conn.commit()

cur.execute("SELECT athlete_id, name, position, squad_number FROM athlete_baselines")
print("Cleaned database roster:")
for r in cur.fetchall():
    print(dict(r))
