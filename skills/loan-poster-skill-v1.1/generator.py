"""Build internal Zamloan or BiuMoney poster prompt plans."""

import argparse
import json
import random
from pathlib import Path

ROOT = Path(__file__).parent


def load_json(path):
    with open(ROOT / path, "r", encoding="utf-8") as file:
        return json.load(file)


def shuffled_cycle(items, quantity, rng):
    values = list(items)
    output = []
    while len(output) < quantity:
        batch = values.copy()
        rng.shuffle(batch)
        output.extend(batch)
    return output[:quantity]


def generate_posters(
    brand="zamloan",
    quantity=1,
    campaign="General Support",
    size="16:9",
    seed=None,
):
    config = load_json("config.json")
    brands = config["supported_brands"]
    formats = config["supported_formats"]
    if brand not in brands:
        raise ValueError(f"Unsupported brand: {brand}")
    if size not in formats:
        raise ValueError(f"Unsupported format: {size}")
    if quantity < 1 or quantity > 10:
        raise ValueError("Quantity must be between 1 and 10")

    rng = random.Random(seed)
    scenes = shuffled_cycle(
        load_json("library/scene_library.json")["scenes"],
        quantity,
        rng,
    )
    characters = shuffled_cycle(
        load_json("library/character_library.json")["characters"],
        quantity,
        rng,
    )
    colors = shuffled_cycle(
        load_json("library/color_library.json")["gradients"],
        quantity,
        rng,
    )
    headlines = shuffled_cycle(
        load_json("library/headline_library.json")["headlines"],
        quantity,
        rng,
    )
    benefits = load_json("library/benefit_library.json")["benefits"]
    brand_label = brands[brand]["label"]
    phone_text = config["default_phone_text"]
    results = []

    for index in range(quantity):
        selected_benefits = rng.sample(benefits, min(3, len(benefits)))
        prompt = f"""
Create a premium {brand_label} Zambia mobile-loan advertising poster in
{size} format with realistic commercial photography.

Use a red-dominant gradient: {colors[index]}.
Use exactly one large semi-transparent Z from the supplied reference.
Keep headline copy on the left and {characters[index]} on the right.
Scene: {scenes[index]}.
Headline: {headlines[index]}.
Benefits: {", ".join(selected_benefits)}.
The main model holds a smartphone toward the viewer.
Phone screen: white interface, solid green checkmark, black text
"{phone_text}".
Campaign: {campaign}.

Do not render {brand_label}, another brand-name wordmark, or a replacement
logo in the top-left corner. Do not add a second Z.
"""
        results.append(
            {
                "id": index + 1,
                "brand": brand,
                "format": size,
                "background": colors[index],
                "character": characters[index],
                "scene": scenes[index],
                "headline": headlines[index],
                "benefits": selected_benefits,
                "prompt": prompt.strip(),
            }
        )

    return results


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--brand", choices=("zamloan", "biumoney"), default="zamloan")
    parser.add_argument("--quantity", type=int, default=1)
    parser.add_argument("--campaign", default="General Support")
    parser.add_argument("--format", choices=("1:1", "16:9"), default="16:9")
    parser.add_argument("--seed", type=int)
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    output = generate_posters(
        brand=args.brand,
        quantity=args.quantity,
        campaign=args.campaign,
        size=args.format,
        seed=args.seed,
    )
    print(json.dumps(output, indent=2, ensure_ascii=False))
