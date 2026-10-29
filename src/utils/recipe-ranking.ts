
export type RankingInventoryItem = {
    name: string;
    quantity?: string;
};

export type RankingRecipe = {
    idMeal: string;
    strMeal: string;
    strCategory?: string | null;
    strIngredient1?: string | null;
    [key: string]: string | null | undefined;
};

/**
 * Only add metadata supported by a verified source or documented
 * manual annotation. Unknown values must remain undefined.
 */
export type RecipeMetadata = {
    cookingTimeMinutes?: number;
    estimatedCost?: number;
    nutritionScore?: number; // documented scale: 0–1
    dietaryTags?: string[];
};

export type RecipePreferences = {
    maxCookingTimeMinutes?: number;
    maxBudget?: number;
    dietaryRestrictions?: string[];
};

export type RankingWeights = {
    ingredientCoverage: number;
    cookingTime: number;
    cost: number;
    nutrition: number;
    dietaryPreference: number;
};

export const DEFAULT_WEIGHTS: RankingWeights = {
    ingredientCoverage: 0.50,
    cookingTime: 0.15,
    cost: 0.15,
    nutrition: 0.10,
    dietaryPreference: 0.10,
};

export type RankedRecipe<T> = {
    recipe: T;
    score: number;
    scoreFactors: string[];
};

const ALIASES: Record<string, string> = {
    tomatoes: "tomato",
    potatoes: "potato",
    onions: "onion",
    eggs: "egg",
    carrots: "carrot",
    mushrooms: "mushroom",
    peppers: "pepper",
    apples: "apple",
    bananas: "banana",
    lemons: "lemon",
    limes: "lime",
    oranges: "orange",
    chillies: "chili",
    chilies: "chili",
    zucchinis: "zucchini",
};

export function normalizeIngredient(name: string): string {
    const cleaned = name
        .toLowerCase()
        .replace(/\([^)]*\)/g, "")
        .replace(/[_-]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    return ALIASES[cleaned] ?? cleaned;
}

export function getRecipeIngredients(recipe: RankingRecipe): string[] {
    const result: string[] = [];

    for (let i = 1; i <= 20; i++) {
        const value = recipe[`strIngredient${i}`];

        if (typeof value === "string" && value.trim()) {
            result.push(value.trim());
        }
    }

    return result;
}

export function getIngredientCoverage(
    recipe: RankingRecipe,
    inventory: RankingInventoryItem[],
) {
    const recipeIngredients = getRecipeIngredients(recipe);
    const inventoryNames = new Set(
        inventory.map((item) => normalizeIngredient(item.name)),
    );

    const available = recipeIngredients.filter((name) =>
        inventoryNames.has(normalizeIngredient(name)),
    );

    const missing = recipeIngredients.filter(
        (name) => !inventoryNames.has(normalizeIngredient(name)),
    );

    const total = recipeIngredients.length;

    return {
        available,
        missing,
        total,
        count: available.length,
        percentage:
            total > 0 ? Math.round((available.length / total) * 100) : 0,
        coverage:
            total > 0 ? available.length / total : 0,
    };
}

/**
 * Algorithm A — baseline.
 * Prioritizes the number of available ingredients, then coverage.
 */
export function rankBaseline<T extends RankingRecipe>(
    recipes: T[],
    inventory: RankingInventoryItem[],
): T[] {
    return [...recipes].sort((a, b) => {
        const matchA = getIngredientCoverage(a, inventory);
        const matchB = getIngredientCoverage(b, inventory);

        if (matchB.count !== matchA.count) {
            return matchB.count - matchA.count;
        }

        if (matchB.coverage !== matchA.coverage) {
            return matchB.coverage - matchA.coverage;
        }

        return a.idMeal.localeCompare(b.idMeal);
    });
}

/**
 * Algorithm B — proposed weighted ranking.
 *
 * For each recipe, only factors with verified metadata and applicable
 * preferences contribute to the score. The denominator is recalculated
 * for each recipe, so missing metadata is not treated as zero.
 */
export function rankProposed<T extends RankingRecipe>(
    recipes: T[],
    inventory: RankingInventoryItem[],
    metadataByRecipeId: Record<string, RecipeMetadata>,
    preferences: RecipePreferences = {},
    weights: RankingWeights = DEFAULT_WEIGHTS,
): RankedRecipe<T>[] {
    return recipes
        .map((recipe) => {
            const metadata = metadataByRecipeId[recipe.idMeal] ?? {};
            const coverage = getIngredientCoverage(recipe, inventory);

            const factors: { name: string; value: number; weight: number }[] = [
                {
                    name: "ingredientCoverage",
                    value: coverage.coverage,
                    weight: weights.ingredientCoverage,
                },
            ];

            if (
                typeof metadata.cookingTimeMinutes === "number" &&
                metadata.cookingTimeMinutes > 0 &&
                typeof preferences.maxCookingTimeMinutes === "number" &&
                preferences.maxCookingTimeMinutes > 0
            ) {
                factors.push({
                    name: "cookingTime",
                    value: Math.max(
                        0,
                        Math.min(
                            1,
                            1 -
                            metadata.cookingTimeMinutes /
                            preferences.maxCookingTimeMinutes,
                        ),
                    ),
                    weight: weights.cookingTime,
                });
            }

            if (
                typeof metadata.estimatedCost === "number" &&
                metadata.estimatedCost >= 0 &&
                typeof preferences.maxBudget === "number" &&
                preferences.maxBudget > 0
            ) {
                factors.push({
                    name: "cost",
                    value: Math.max(
                        0,
                        Math.min(
                            1,
                            1 - metadata.estimatedCost / preferences.maxBudget,
                        ),
                    ),
                    weight: weights.cost,
                });
            }

            if (
                typeof metadata.nutritionScore === "number" &&
                metadata.nutritionScore >= 0 &&
                metadata.nutritionScore <= 1
            ) {
                factors.push({
                    name: "nutrition",
                    value: metadata.nutritionScore,
                    weight: weights.nutrition,
                });
            }

            if (preferences.dietaryRestrictions?.length) {
                const tags = (metadata.dietaryTags ?? []).map((tag) =>
                    tag.toLowerCase(),
                );

                // Do not score this factor if dietary metadata is absent.
                if (tags.length > 0) {
                    const allRestrictionsSatisfied =
                        preferences.dietaryRestrictions.every((restriction) =>
                            tags.includes(restriction.toLowerCase()),
                        );

                    factors.push({
                        name: "dietaryPreference",
                        value: allRestrictionsSatisfied ? 1 : 0,
                        weight: weights.dietaryPreference,
                    });
                }
            }

            const totalWeight = factors.reduce(
                (sum, factor) => sum + factor.weight,
                0,
            );

            const score =
                totalWeight > 0
                    ? factors.reduce(
                        (sum, factor) => sum + factor.value * factor.weight,
                        0,
                    ) / totalWeight
                    : 0;

            return {
                recipe,
                score,
                scoreFactors: factors.map((factor) => factor.name),
            };
        })
        .sort((a, b) => {
            if (b.score !== a.score) {
                return b.score - a.score;
            }

            return a.recipe.idMeal.localeCompare(b.recipe.idMeal);
        });
}
