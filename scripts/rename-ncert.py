#!/usr/bin/env python3
"""
NCERT Chapter PDF Decoder & Organizer:
Letters map to Classes:
  f: Class 6, g: Class 7, h: Class 8, i: Class 9, j: Class 10, k: Class 11, l: Class 12

Sequel / Multi-part Book Handling:
  Class 7 History: gees1 (Ch 1..12), gees2 (Ch 13..20)
  Class 8 History: hees1 (Ch 1..7), hees2 (Ch 8..16)
  Class 10 History: jess1 (Part 1: Ch 1..7), jess3 (Part 2: Ch 8..12)
  Class 12 History: lehs1 (Part 1: Ch 1..4), lehs2 (Part 2: Ch 5..8), lehs3 (Part 3: Ch 9..12)
"""

import os
import shutil
import zipfile
import glob
import re

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NCERT_DIR = os.path.join(BASE_DIR, "NewNCERT")
OUTPUT_DIR = os.path.join(NCERT_DIR, "Organized")

LETTER_CLASS_MAP = {
    "f": "Class 6",
    "g": "Class 7",
    "h": "Class 8",
    "i": "Class 9",
    "j": "Class 10",
    "k": "Class 11",
    "l": "Class 12",
}

def get_subject_for_code(code: str, parent_folder: str) -> str:
    lower = code.lower()
    if "jess4" in lower or "keps" in lower or "leps" in lower:
        return "Political Science"
    if "jess2" in lower or "keec" in lower or "kest" in lower or "leec" in lower:
        return "Economics"
    if "jess1" in lower or "jess3" in lower or "fees" in lower or "gees" in lower or "hees" in lower or "iest" in lower or "kehs" in lower or "lehs" in lower:
        return "History"
    
    # Fallback to parent directory name in NewNCERT
    if "Politics" in parent_folder:
        return "Political Science"
    if "Economics" in parent_folder:
        return "Economics"
    if "History" in parent_folder:
        return "History"
    return "Miscellaneous"

def unzip_all():
    for root, _, files in os.walk(NCERT_DIR):
        for f in files:
            if f.endswith(".zip"):
                zip_path = os.path.join(root, f)
                print(f"📦 Extracting {zip_path}...")
                with zipfile.ZipFile(zip_path, "r") as z:
                    z.extractall(root)

def organize_ncert():
    unzip_all()

    if os.path.exists(OUTPUT_DIR):
        shutil.rmtree(OUTPUT_DIR)
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    copied_count = 0
    all_pdfs = sorted(glob.glob(os.path.join(NCERT_DIR, "**/*.pdf"), recursive=True))

    for pdf_path in all_pdfs:
        if "Organized" in pdf_path:
            continue

        filename = os.path.basename(pdf_path)
        code = os.path.splitext(filename)[0].lower()
        first_char = code[0]

        if first_char in LETTER_CLASS_MAP:
            target_class = LETTER_CLASS_MAP[first_char]
            target_subject = get_subject_for_code(code, pdf_path)

            # Determine clean chapter name & sequence
            m = re.search(r"(\d{2})$", code)
            if m:
                ch_num = int(m.group(1))
                
                # Handle multi-part series
                if code.startswith("gees2"):
                    ch_num += 12 # Class 7 History Part 2 (Ch 13..20)
                elif code.startswith("hees2"):
                    ch_num += 7  # Class 8 History Part 2 (Ch 8..16)
                elif code.startswith("jess3"):
                    ch_num += 7  # Class 10 History Part 2 (Ch 8..12) after jess1 (Ch 1..7)
                elif code.startswith("lehs2"):
                    ch_num += 4  # Class 12 History Part 2 (Ch 5..8)
                elif code.startswith("lehs3"):
                    ch_num += 8  # Class 12 History Part 3 (Ch 9..12)
                
                target_filename = f"Chapter {ch_num}.pdf"
            elif "ps" in code:
                prefix = "Part 2 - " if any(x in code for x in ["gees2", "hees2", "jess3", "lehs2"]) else ("Part 3 - " if "lehs3" in code else "")
                target_filename = f"{prefix}Prelims.pdf"
            elif "cc" in code:
                prefix = "Part 2 - " if any(x in code for x in ["gees2", "hees2", "jess3", "lehs2"]) else ("Part 3 - " if "lehs3" in code else "")
                target_filename = f"{prefix}Cover.pdf"
            elif "gl" in code:
                prefix = "Part 2 - " if any(x in code for x in ["gees2", "hees2", "jess3", "lehs2"]) else ("Part 3 - " if "lehs3" in code else "")
                target_filename = f"{prefix}Glossary.pdf"
            elif "a1" in code:
                target_filename = "Appendix.pdf"
            else:
                target_filename = f"{filename}"

            dest_folder = os.path.join(OUTPUT_DIR, target_class, target_subject)
            os.makedirs(dest_folder, exist_ok=True)
            dest_path = os.path.join(dest_folder, target_filename)

            shutil.copy2(pdf_path, dest_path)
            print(f"✅ {filename} -> {target_class} / {target_subject} / {target_filename}")
            copied_count += 1

    print("\n" + "=" * 60)
    print(f"🎉 Successfully organized {copied_count} NCERT chapter PDFs!")
    print(f"📂 Output directory: {OUTPUT_DIR}")
    print("=" * 60)

if __name__ == "__main__":
    organize_ncert()
