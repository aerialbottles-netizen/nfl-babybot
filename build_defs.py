#!/usr/bin/env python3
import pandas as pd, json, os

SEASON = 2025
PBP_URL = f"https://github.com/nflverse/nflfastR-data/releases/download/play_by_play_{SEASON}/play_by_play_{SEASON}.parquet"

def load_pbp():
    return pd.read_parquet(PBP_URL)

def compute_defs(pbp: pd.DataFrame):
    df = pbp.copy()
    if "season_type" in df.columns:
        df = df[df["season_type"] == "REG"].copy()
    need = ["game_id","defteam","posteam","play_type","touchdown","yardline_100","rush_attempt","pass_attempt"]
    need = [c for c in need if c in df.columns]
    df = df[need].copy()
    df["rush_td"] = ((df.get("touchdown",0)==1) & (df.get("rush_attempt",0)==1)).astype(int)
    df["pass_td"] = ((df.get("touchdown",0)==1) & (df.get("pass_attempt",0)==1)).astype(int)
    df["rz_entry"] = (df.get("yardline_100",100) <= 20).astype(int)
    df["rz_td"] = ((df.get("yardline_100",100) <= 20) & (df.get("touchdown",0)==1)).astype(int)
    g = df.groupby(["defteam","game_id"], as_index=False).agg(
        rush_td_allowed=("rush_td","sum"),
        pass_td_allowed=("pass_td","sum"),
        rz_entries=("rz_entry","sum"),
        rz_tds=("rz_td","sum")
    )
    team = g.groupby("defteam", as_index=False).agg(
        games=("game_id","nunique"),
        rush_td=("rush_td_allowed","sum"),
        pass_td=("pass_td_allowed","sum"),
        rz_entries=("rz_entries","sum"),
        rz_tds=("rz_tds","sum")
    )
    team["rush_td_pg"] = team["rush_td"] / team["games"].clip(lower=1)
    team["pass_td_pg"] = team["pass_td"] / team["games"].clip(lower=1)
    team["rz_pct"] = team.apply(lambda r: (r["rz_tds"] / r["rz_entries"]) if r["rz_entries"] > 0 else 0.58, axis=1)
    rush_avg = team["rush_td_pg"].mean() or 0.7
    pass_avg = team["pass_td_pg"].mean() or 1.3
    team["def_rush"] = (team["rush_td_pg"] / rush_avg).clip(0.6, 1.6)
    team["def_pass"] = (team["pass_td_pg"] / pass_avg).clip(0.6, 1.6)
    team["rz"] = team["rz_pct"].clip(0.35, 0.75)
    out = {}
    for _, r in team.iterrows():
        out[r["defteam"]] = {
            "def_rush": round(float(r["def_rush"]), 3),
            "def_pass": round(float(r["def_pass"]), 3),
            "rz":       round(float(r["rz"]), 3)
        }
    return out

def main():
    pbp = load_pbp()
    defs = compute_defs(pbp)
    os.makedirs("data", exist_ok=True)
    with open("data/defs_2025.json","w") as f:
        json.dump(defs, f, indent=2)
    print(f"wrote data/defs_2025.json with {len(defs)} teams")

if __name__ == "__main__":
    main()