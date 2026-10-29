import AsyncStorage from '@react-native-async-storage/async-storage';

import { useFocusEffect, useRouter } from 'expo-router';

import { useCallback, useState } from 'react';

import {
    ActivityIndicator,

    Image,

    ScrollView,

    StyleSheet,

    Text,

    TouchableOpacity,

    View,
} from 'react-native';



type Ingredient = {

    id: number;

    name: string;

    quantity: string;

};



type Recipe = {

    idMeal: string;

    strMeal: string;

    strMealThumb: string;

    strCategory: string;

    strInstructions: string;

    strArea: string;

    [key: string]: string | null;

};



const STORAGE_KEY = '@betterrecipe_inventory';



const API_BASE =

    'https://www.themealdb.com/api/json/v1/1';



const CATEGORIES = [

    'All',

    'Breakfast',

    'Chicken',

    'Beef',

    'Seafood',

    'Vegetarian',

    'Dessert',

];



function normalizeIngredient(name: string): string {

    let value = name

        .toLowerCase()

        .replace(/_/g, ' ')

        .replace(/-/g, ' ')

        .replace(/\([^)]*\)/g, '')

        .replace(/\s+/g, ' ')

        .trim();



    const aliases: Record<string, string> = {

        tomatoes: 'tomato',

        potatoes: 'potato',

        onions: 'onion',

        eggs: 'egg',

        carrots: 'carrot',

        mushrooms: 'mushroom',

        peppers: 'pepper',

        apples: 'apple',

        bananas: 'banana',

        lemons: 'lemon',

        limes: 'lime',

        oranges: 'orange',

        cloves: 'clove',

        chillies: 'chili',

        chilies: 'chili',

        zucchinis: 'zucchini',

    };



    if (aliases[value]) {

        value = aliases[value];

    }



    return value;

}



function getRecipeIngredients(recipe: Recipe): string[] {

    const result: string[] = [];



    for (let i = 1; i <= 20; i++) {

        const value = recipe[`strIngredient${i}`];



        if (typeof value === 'string' && value.trim()) {

            result.push(value.trim());

        }

    }



    return result;

}



type RecipeMetadata = {
    cookingTimeMinutes?: number;
    estimatedCost?: number;
    nutritionScore?: number; // normalized 0–1 from a documented source
    dietaryTags?: string[];
};

type RankingPreferences = {
    maxCookingTimeMinutes?: number;
    maxBudget?: number;
    dietaryRestrictions?: string[];
};

const RANKING_WEIGHTS = { ingredientCoverage: 0.50, cookingTime: 0.15, cost: 0.15, nutrition: 0.10, dietaryPreference: 0.10 };

function rankBaseline(recipes: Recipe[], inventory: Ingredient[]): Recipe[] {
    return [...recipes].sort((a, b) => {
        const matchA = getIngredientMatches(a, inventory);
        const matchB = getIngredientMatches(b, inventory);
        if (matchB.count !== matchA.count) return matchB.count - matchA.count;
        if (matchB.percentage !== matchA.percentage) return matchB.percentage - matchA.percentage;
        return a.idMeal.localeCompare(b.idMeal);
    });
}

function rankProposed(recipes: Recipe[], inventory: Ingredient[], metadataByRecipeId: Record<string, RecipeMetadata>, preferences: RankingPreferences = {}) {
    return recipes.map((recipe) => {
        const match = getIngredientMatches(recipe, inventory);
        const metadata = metadataByRecipeId[recipe.idMeal] ?? {};
        const factors: { name: string; value: number; weight: number }[] = [
            { name: 'ingredientCoverage', value: match.total ? match.count / match.total : 0, weight: RANKING_WEIGHTS.ingredientCoverage },
        ];
        if (typeof metadata.cookingTimeMinutes === 'number' && typeof preferences.maxCookingTimeMinutes === 'number' && preferences.maxCookingTimeMinutes > 0) {
            factors.push({ name: 'cookingTime', value: Math.max(0, Math.min(1, 1 - metadata.cookingTimeMinutes / preferences.maxCookingTimeMinutes)), weight: RANKING_WEIGHTS.cookingTime });
        }
        if (typeof metadata.estimatedCost === 'number' && typeof preferences.maxBudget === 'number' && preferences.maxBudget > 0) {
            factors.push({ name: 'cost', value: Math.max(0, Math.min(1, 1 - metadata.estimatedCost / preferences.maxBudget)), weight: RANKING_WEIGHTS.cost });
        }
        if (typeof metadata.nutritionScore === 'number' && metadata.nutritionScore >= 0 && metadata.nutritionScore <= 1) {
            factors.push({ name: 'nutrition', value: metadata.nutritionScore, weight: RANKING_WEIGHTS.nutrition });
        }
        if (preferences.dietaryRestrictions?.length && metadata.dietaryTags?.length) {
            const tags = metadata.dietaryTags.map((tag) => tag.toLowerCase());
            const satisfied = preferences.dietaryRestrictions.every((tag) => tags.includes(tag.toLowerCase()));
            factors.push({ name: 'dietaryPreference', value: satisfied ? 1 : 0, weight: RANKING_WEIGHTS.dietaryPreference });
        }
        const totalWeight = factors.reduce((sum, factor) => sum + factor.weight, 0);
        const score = totalWeight ? factors.reduce((sum, factor) => sum + factor.value * factor.weight, 0) / totalWeight : 0;
        return { recipe, score, scoreFactors: factors.map((factor) => factor.name) };
    }).sort((a, b) => b.score - a.score || a.recipe.idMeal.localeCompare(b.recipe.idMeal));
}

function getIngredientMatches(

    recipe: Recipe,

    inventory: Ingredient[]

) {

    const recipeIngredients = getRecipeIngredients(recipe);



    const availableNames = new Set(

        inventory.map((item) => normalizeIngredient(item.name))

    );



    const available: string[] = [];

    const missing: string[] = [];



    recipeIngredients.forEach((name) => {

        if (availableNames.has(normalizeIngredient(name))) {

            available.push(name);

        } else {

            missing.push(name);

        }

    });



    const total = recipeIngredients.length;

    const percentage =

        total > 0 ? Math.round((available.length / total) * 100) : 0;



    return {

        available,

        missing,

        total,

        percentage,

        count: available.length,

    };

}



export default function RecipesScreen() {

    const router = useRouter();



    const [ingredients, setIngredients] = useState<Ingredient[]>([]);

    const [recipes, setRecipes] = useState<Recipe[]>([]);

    const [selectedCategory, setSelectedCategory] = useState('All');

    const [isLoading, setIsLoading] = useState(true);

    const [errorMessage, setErrorMessage] = useState('');

    const [selectedRecipe, setSelectedRecipe] =

        useState<Recipe | null>(null);



    const loadRecipes = useCallback(async () => {

        setIsLoading(true);

        setErrorMessage('');



        try {

            // Load the user's saved inventory.

            const saved = await AsyncStorage.getItem(STORAGE_KEY);

            const parsed: unknown = saved ? JSON.parse(saved) : [];



            const savedIngredients: Ingredient[] = Array.isArray(parsed)

                ? parsed.filter((item: unknown): item is Ingredient => {

                    if (

                        typeof item !== 'object' ||

                        item === null ||

                        !('name' in item)

                    ) {

                        return false;

                    }



                    return (

                        typeof item.name === 'string' &&

                        item.name.trim().length > 0

                    );

                })

                : [];



            setIngredients(savedIngredients);

            setRecipes([]);

            setSelectedRecipe(null);



            if (savedIngredients.length === 0) {

                setErrorMessage(

                    'Your inventory is empty. Add ingredients to discover recipes.'

                );

                return;

            }



            // Search by actual ingredient using TheMealDB's filter endpoint.

            const uniqueNames = [

                ...new Set(

                    savedIngredients

                        .map((item) => item.name.trim())

                        .filter(Boolean)

                ),

            ].slice(0, 4);



            const searchResults = await Promise.all(

                uniqueNames.map(async (name) => {

                    try {

                        const ingredientQuery = name.replace(/\s+/g, '_');

                        const response = await fetch(

                            `${API_BASE}/filter.php?i=${encodeURIComponent(

                                ingredientQuery

                            )}`

                        );



                        if (!response.ok) {

                            return [];

                        }



                        const data = await response.json();



                        return Array.isArray(data.meals)

                            ? data.meals

                            : [];

                    } catch (error) {

                        console.warn(

                            `Ingredient search failed for ${name}:`,

                            error

                        );

                        return [];

                    }

                })

            );



            // Combine candidates and remove duplicate recipe IDs.

            const candidateMap = new Map<

                string,

                { idMeal: string; strMeal: string; strMealThumb: string }

            >();



            searchResults.flat().forEach((meal) => {

                if (meal?.idMeal) {

                    candidateMap.set(meal.idMeal, meal);

                }

            });



            const candidates = Array.from(candidateMap.values()).slice(

                0,

                20

            );



            if (candidates.length === 0) {

                setErrorMessage(

                    'No recipes were found for these ingredients. Try adding common ingredients such as chicken, rice, or tomato.'

                );

                return;

            }



            // Fetch full details so we can inspect all recipe ingredients.

            const detailResults = await Promise.all(

                candidates.map(async (candidate): Promise<Recipe | null> => {

                    try {

                        const response = await fetch(

                            `${API_BASE}/lookup.php?i=${encodeURIComponent(

                                candidate.idMeal

                            )}`

                        );



                        if (!response.ok) {

                            return null;

                        }



                        const data = await response.json();



                        if (

                            Array.isArray(data.meals) &&

                            data.meals.length > 0

                        ) {

                            return data.meals[0] as Recipe;

                        }



                        return null;

                    } catch (error) {

                        console.warn(

                            'Could not fetch recipe details:',

                            error

                        );

                        return null;

                    }

                })

            );
            // Candidate set is identical for both algorithms.
            const completeRecipes = detailResults
                .filter((recipe): recipe is Recipe => recipe !== null)
                .filter((recipe) => getRecipeIngredients(recipe).length > 0);

            // Algorithm A: baseline ranking, preserving the current behavior.
            const baselineRecipes = rankBaseline(completeRecipes, savedIngredients);

            // Add only verified metadata here when a documented dataset is ready.
            const verifiedRecipeMetadata: Record<string, RecipeMetadata> = {};

            // Algorithm B: proposed weighted ranking. Missing metadata is excluded.
            // TheMealDB does not reliably provide all time, cost, and nutrition fields.
            const proposedResults = rankProposed(completeRecipes, savedIngredients, verifiedRecipeMetadata);
            void proposedResults; // Reserved for the evaluation/comparison screen.

            // Keep the baseline as the visible default so the current UI stays stable.
            setRecipes(baselineRecipes);



            if (completeRecipes.length === 0) {

                setErrorMessage(

                    'We could not retrieve complete recipe details. Please try refreshing.'

                );

            }

        } catch (error) {

            console.error('Could not load recipes:', error);

            setRecipes([]);

            setErrorMessage(

                'Could not load your inventory or recipes. Check your internet connection and try again.'

            );

        } finally {

            setIsLoading(false);

        }

    }, []);



    useFocusEffect(

        useCallback(() => {

            loadRecipes();

        }, [loadRecipes])

    );



    const filteredRecipes = recipes.filter((recipe) => {

        if (selectedCategory === 'All') {

            return true;

        }



        if (selectedCategory === 'Vegetarian') {

            return ['vegetarian', 'vegan'].includes(

                (recipe.strCategory || '').toLowerCase()

            );

        }



        return (

            (recipe.strCategory || '').toLowerCase() ===

            selectedCategory.toLowerCase()

        );

    });



    const renderRecipeCard = (recipe: Recipe) => {

        const match = getIngredientMatches(recipe, ingredients);



        return (

            <TouchableOpacity

                key={recipe.idMeal}

                style={styles.recipeCard}

                activeOpacity={0.85}

                onPress={() => setSelectedRecipe(recipe)}

            >

                <Image

                    source={{ uri: recipe.strMealThumb }}

                    style={styles.recipeImage}

                    resizeMode="cover"

                />



                <View style={styles.recipeContent}>

                    <Text style={styles.recipeCategory}>

                        {recipe.strCategory || 'Recipe'}

                    </Text>



                    <Text style={styles.recipeTitle}>

                        {recipe.strMeal}

                    </Text>



                    <Text style={styles.recipeArea}>

                        {recipe.strArea || 'International cuisine'}

                    </Text>



                    <View style={styles.matchHeader}>

                        <Text style={styles.matchLabel}>

                            INGREDIENT MATCH

                        </Text>



                        <Text style={styles.matchPercentage}>

                            {match.percentage}%

                        </Text>

                    </View>



                    <View style={styles.progressTrack}>

                        <View

                            style={[

                                styles.progressFill,

                                { width: `${match.percentage}%` },

                            ]}

                        />

                    </View>



                    <Text style={styles.matchText}>

                        {match.count} of {match.total} ingredients available

                    </Text>



                    {match.missing.length > 0 && (

                        <Text style={styles.missingPreview}>

                            Still needed: {match.missing.slice(0, 3).join(', ')}

                            {match.missing.length > 3 ? '…' : ''}

                        </Text>

                    )}



                    <Text style={styles.viewRecipe}>

                        View recipe →

                    </Text>

                </View>

            </TouchableOpacity>

        );

    };



    if (selectedRecipe) {

        const match = getIngredientMatches(

            selectedRecipe,

            ingredients

        );



        const recipeIngredients = getRecipeIngredients(selectedRecipe);



        return (

            <View style={styles.container}>

                <ScrollView showsVerticalScrollIndicator={false}>

                    <View style={styles.detailTop}>

                        <TouchableOpacity

                            style={styles.backButton}

                            onPress={() => setSelectedRecipe(null)}

                        >

                            <Text style={styles.backButtonText}>

                                ← Back to recipes

                            </Text>

                        </TouchableOpacity>

                    </View>



                    <Image

                        source={{ uri: selectedRecipe.strMealThumb }}

                        style={styles.detailImage}

                        resizeMode="cover"

                    />



                    <View style={styles.detailContent}>

                        <Text style={styles.detailCategory}>

                            {selectedRecipe.strCategory} · {selectedRecipe.strArea}

                        </Text>



                        <Text style={styles.detailTitle}>

                            {selectedRecipe.strMeal}

                        </Text>



                        <View style={styles.detailMatchCard}>

                            <Text style={styles.detailMatchTitle}>

                                You have {match.percentage}% of the ingredients

                            </Text>



                            <Text style={styles.detailMatchSubtitle}>

                                {match.count} available · {match.missing.length} missing

                            </Text>



                            <View style={styles.progressTrack}>

                                <View

                                    style={[

                                        styles.progressFill,

                                        { width: `${match.percentage}%` },

                                    ]}

                                />

                            </View>

                        </View>



                        <Text style={styles.sectionTitle}>

                            Ingredients

                        </Text>



                        {recipeIngredients.map((ingredient, index) => {

                            const measure =

                                selectedRecipe[`strMeasure${index + 1}`];



                            const isAvailable = match.available.includes(

                                ingredient

                            );



                            return (

                                <View

                                    key={`${ingredient}-${index}`}

                                    style={styles.ingredientRow}

                                >

                                    <Text

                                        style={[

                                            styles.ingredientStatus,

                                            isAvailable

                                                ? styles.availableStatus

                                                : styles.missingStatus,

                                        ]}

                                    >

                                        {isAvailable ? '✓' : '+'}

                                    </Text>



                                    <View style={styles.ingredientDetail}>

                                        <Text style={styles.ingredientText}>

                                            {typeof measure === 'string' &&

                                                measure.trim()

                                                ? `${measure.trim()} `

                                                : ''}

                                            {ingredient}

                                        </Text>



                                        <Text

                                            style={[

                                                styles.availabilityLabel,

                                                isAvailable

                                                    ? styles.availableText

                                                    : styles.missingText,

                                            ]}

                                        >

                                            {isAvailable

                                                ? 'In your inventory'

                                                : 'You need this'}

                                        </Text>

                                    </View>

                                </View>

                            );

                        })}



                        <Text style={styles.sectionTitle}>

                            Instructions

                        </Text>



                        <Text style={styles.instructions}>

                            {selectedRecipe.strInstructions ||

                                'Instructions are not available for this recipe.'}

                        </Text>



                        <TouchableOpacity

                            style={styles.backToRecipesButton}

                            onPress={() => setSelectedRecipe(null)}

                        >

                            <Text style={styles.backToRecipesText}>

                                Back to all recipes

                            </Text>

                        </TouchableOpacity>

                    </View>

                </ScrollView>

            </View>

        );

    }



    return (

        <View style={styles.container}>

            <ScrollView

                showsVerticalScrollIndicator={false}

                contentContainerStyle={styles.scrollContent}

            >

                <TouchableOpacity

                    style={styles.backButton}

                    onPress={() => router.back()}

                >

                    <Text style={styles.backButtonText}>← Back</Text>

                </TouchableOpacity>



                <Text style={styles.brand}>BETTERRECIPE</Text>



                <Text style={styles.heading}>Discover Recipes 🍳</Text>



                <Text style={styles.subtitle}>

                    Delicious ideas, ranked by what you already have.

                </Text>



                <View style={styles.inventoryBanner}>

                    <View style={styles.inventoryInfo}>

                        <Text style={styles.inventoryTitle}>

                            Your available ingredients

                        </Text>



                        <Text style={styles.inventorySubtitle}>

                            {ingredients.length === 0

                                ? 'Your inventory is empty'

                                : `${ingredients.length} ingredient${ingredients.length === 1 ? '' : 's'} saved`}

                        </Text>

                    </View>



                    <TouchableOpacity

                        style={styles.manageButton}

                        onPress={() => router.push('/inventory')}

                    >

                        <Text style={styles.manageButtonText}>

                            Manage →

                        </Text>

                    </TouchableOpacity>

                </View>



                {ingredients.length > 0 && (

                    <ScrollView

                        horizontal

                        showsHorizontalScrollIndicator={false}

                        style={styles.inventoryList}

                    >

                        {ingredients.map((item) => (

                            <View

                                key={item.id}

                                style={styles.ingredientChip}

                            >

                                <Text style={styles.ingredientChipText}>

                                    {item.name}

                                </Text>

                            </View>

                        ))}

                    </ScrollView>

                )}



                <View style={styles.recipesHeadingRow}>

                    <Text style={styles.sectionTitle}>

                        Best ingredient matches

                    </Text>



                    <TouchableOpacity onPress={loadRecipes}>

                        <Text style={styles.refreshText}>Refresh ↻</Text>

                    </TouchableOpacity>

                </View>



                <Text style={styles.sectionHint}>

                    Recipes with more ingredients already in your inventory

                    appear first.

                </Text>



                <ScrollView

                    horizontal

                    showsHorizontalScrollIndicator={false}

                    style={styles.categoryList}

                >

                    {CATEGORIES.map((category) => {

                        const isSelected = selectedCategory === category;



                        return (

                            <TouchableOpacity

                                key={category}

                                style={[

                                    styles.categoryChip,

                                    isSelected &&

                                    styles.categoryChipSelected,

                                ]}

                                onPress={() => setSelectedCategory(category)}

                            >

                                <Text

                                    style={[

                                        styles.categoryText,

                                        isSelected &&

                                        styles.categoryTextSelected,

                                    ]}

                                >

                                    {category}

                                </Text>

                            </TouchableOpacity>

                        );

                    })}

                </ScrollView>



                {isLoading ? (

                    <View style={styles.statusContainer}>

                        <ActivityIndicator

                            size="large"

                            color="#27845C"

                        />

                        <Text style={styles.statusText}>

                            Matching recipes to your ingredients...

                        </Text>

                    </View>

                ) : errorMessage ? (

                    <View style={styles.emptyCard}>

                        <Text style={styles.emptyEmoji}>🍽️</Text>



                        <Text style={styles.emptyTitle}>

                            Let's find something to cook

                        </Text>



                        <Text style={styles.emptyText}>

                            {errorMessage}

                        </Text>



                        <TouchableOpacity

                            style={styles.retryButton}

                            onPress={loadRecipes}

                        >

                            <Text style={styles.retryButtonText}>

                                Try again

                            </Text>

                        </TouchableOpacity>



                        <TouchableOpacity

                            style={styles.manageEmptyButton}

                            onPress={() => router.push('/inventory')}

                        >

                            <Text style={styles.manageEmptyText}>

                                Open inventory

                            </Text>

                        </TouchableOpacity>

                    </View>

                ) : filteredRecipes.length === 0 ? (

                    <View style={styles.emptyCard}>

                        <Text style={styles.emptyEmoji}>🥗</Text>



                        <Text style={styles.emptyTitle}>

                            No recipes in this category

                        </Text>



                        <Text style={styles.emptyText}>

                            Try another category or add more ingredients.

                        </Text>

                    </View>

                ) : (

                    <>

                        <Text style={styles.resultCount}>

                            {filteredRecipes.length} recipes found

                        </Text>



                        {filteredRecipes.map(renderRecipeCard)}

                    </>

                )}



                <Text style={styles.disclaimer}>

                    Recipe data provided by TheMealDB. Match scores compare

                    ingredient names; quantities, substitutions and dietary

                    suitability are not yet evaluated.

                </Text>

            </ScrollView>

        </View>

    );

}



const styles = StyleSheet.create({

    container: {

        flex: 1,

        backgroundColor: '#F7F8F3',

    },

    scrollContent: {

        paddingHorizontal: 20,

        paddingTop: 18,

        paddingBottom: 40,

    },

    backButton: {

        alignSelf: 'flex-start',

        paddingVertical: 10,

        paddingHorizontal: 12,

        backgroundColor: '#E9F1E9',

        borderRadius: 12,

        marginBottom: 20,

    },

    backButtonText: {

        color: '#286345',

        fontSize: 14,

        fontWeight: '600',

    },

    brand: {

        color: '#27845C',

        fontSize: 12,

        fontWeight: '800',

        letterSpacing: 2,

        marginBottom: 8,

    },

    heading: {

        color: '#20352A',

        fontSize: 28,

        fontWeight: '800',

        marginBottom: 8,

    },

    subtitle: {

        color: '#68756B',

        fontSize: 15,

        lineHeight: 22,

        marginBottom: 24,

    },

    inventoryBanner: {

        flexDirection: 'row',

        alignItems: 'center',

        justifyContent: 'space-between',

        backgroundColor: '#E7F1E6',

        borderRadius: 18,

        padding: 16,

        marginBottom: 12,

    },

    inventoryInfo: {

        flex: 1,

        paddingRight: 8,

    },

    inventoryTitle: {

        color: '#254632',

        fontSize: 15,

        fontWeight: '700',

        marginBottom: 5,

    },

    inventorySubtitle: {

        color: '#637568',

        fontSize: 13,

    },

    manageButton: {

        backgroundColor: '#27845C',

        paddingVertical: 10,

        paddingHorizontal: 12,

        borderRadius: 11,

    },

    manageButtonText: {

        color: '#FFFFFF',

        fontSize: 13,

        fontWeight: '700',

    },

    inventoryList: {

        marginBottom: 22,

        maxHeight: 42,

    },

    ingredientChip: {

        backgroundColor: '#FFFFFF',

        borderColor: '#DCE8DC',

        borderWidth: 1,

        borderRadius: 20,

        paddingHorizontal: 13,

        paddingVertical: 9,

        marginRight: 8,

    },

    ingredientChipText: {

        color: '#3D654A',

        fontSize: 13,

        fontWeight: '600',

    },

    sectionTitle: {

        color: '#20352A',

        fontSize: 18,

        fontWeight: '800',

        marginBottom: 14,

        marginTop: 6,

        flexShrink: 1,

    },

    recipesHeadingRow: {

        flexDirection: 'row',

        alignItems: 'center',

        justifyContent: 'space-between',

        gap: 8,

        marginBottom: 4,

    },

    sectionHint: {

        color: '#68756B',

        fontSize: 13,

        lineHeight: 19,

        marginBottom: 14,

    },

    refreshText: {

        color: '#27845C',

        fontSize: 14,

        fontWeight: '700',

        marginBottom: 8,

    },

    categoryList: {

        marginBottom: 18,

        maxHeight: 44,

    },

    categoryChip: {

        backgroundColor: '#FFFFFF',

        borderColor: '#E1E6DD',

        borderWidth: 1,

        borderRadius: 22,

        paddingHorizontal: 15,

        paddingVertical: 11,

        marginRight: 8,

    },

    categoryChipSelected: {

        backgroundColor: '#27845C',

        borderColor: '#27845C',

    },

    categoryText: {

        color: '#59685D',

        fontSize: 13,

        fontWeight: '600',

    },

    categoryTextSelected: {

        color: '#FFFFFF',

    },

    resultCount: {

        color: '#68756B',

        fontSize: 13,

        marginBottom: 12,

    },

    statusContainer: {

        alignItems: 'center',

        paddingVertical: 40,

    },

    statusText: {

        color: '#68756B',

        fontSize: 14,

        marginTop: 12,

    },

    recipeCard: {

        backgroundColor: '#FFFFFF',

        borderRadius: 18,

        overflow: 'hidden',

        marginBottom: 18,

        borderWidth: 1,

        borderColor: '#E8EBE3',

    },

    recipeImage: {

        width: '100%',

        height: 200,

        backgroundColor: '#E9EEE6',

    },

    recipeContent: {

        padding: 16,

    },

    recipeCategory: {

        color: '#27845C',

        fontSize: 11,

        fontWeight: '800',

        letterSpacing: 1,

        textTransform: 'uppercase',

        marginBottom: 6,

    },

    recipeTitle: {

        color: '#20352A',

        fontSize: 19,

        fontWeight: '800',

        marginBottom: 5,

    },

    recipeArea: {

        color: '#7A857B',

        fontSize: 13,

        marginBottom: 15,

    },

    matchHeader: {

        flexDirection: 'row',

        justifyContent: 'space-between',

        alignItems: 'center',

        marginBottom: 8,

    },

    matchLabel: {

        color: '#68756B',

        fontSize: 10,

        fontWeight: '800',

        letterSpacing: 0.8,

    },

    matchPercentage: {

        color: '#27845C',

        fontSize: 17,

        fontWeight: '800',

    },

    progressTrack: {

        height: 7,

        backgroundColor: '#E8EDE5',

        borderRadius: 8,

        overflow: 'hidden',

        marginBottom: 9,

    },

    progressFill: {

        height: '100%',

        backgroundColor: '#27845C',

        borderRadius: 8,

    },

    matchText: {

        color: '#286345',

        fontSize: 12,

        fontWeight: '700',

        marginBottom: 8,

    },

    missingPreview: {

        color: '#8A6740',

        fontSize: 12,

        lineHeight: 18,

        marginBottom: 12,

    },

    viewRecipe: {

        color: '#27845C',

        fontSize: 14,

        fontWeight: '800',

        marginTop: 4,

    },

    emptyCard: {

        backgroundColor: '#FFFFFF',

        borderRadius: 18,

        padding: 24,

        alignItems: 'center',

        borderColor: '#E8EBE3',

        borderWidth: 1,

        marginBottom: 20,

    },

    emptyEmoji: {

        fontSize: 38,

        marginBottom: 12,

    },

    emptyTitle: {

        color: '#20352A',

        fontSize: 17,

        fontWeight: '800',

        textAlign: 'center',

        marginBottom: 8,

    },

    emptyText: {

        color: '#68756B',

        fontSize: 14,

        lineHeight: 21,

        textAlign: 'center',

    },

    retryButton: {

        backgroundColor: '#27845C',

        borderRadius: 12,

        paddingHorizontal: 20,

        paddingVertical: 12,

        marginTop: 16,

    },

    retryButtonText: {

        color: '#FFFFFF',

        fontSize: 14,

        fontWeight: '700',

    },

    manageEmptyButton: {

        paddingVertical: 12,

        paddingHorizontal: 16,

        marginTop: 4,

    },

    manageEmptyText: {

        color: '#27845C',

        fontSize: 14,

        fontWeight: '700',

    },

    disclaimer: {

        color: '#879087',

        fontSize: 11,

        lineHeight: 17,

        textAlign: 'center',

        marginTop: 12,

        paddingHorizontal: 10,

    },

    detailTop: {

        paddingHorizontal: 20,

        paddingTop: 18,

    },

    detailImage: {

        width: '100%',

        height: 260,

        backgroundColor: '#E9EEE6',

    },

    detailContent: {

        padding: 20,

        paddingBottom: 40,

    },

    detailCategory: {

        color: '#27845C',

        fontSize: 12,

        fontWeight: '800',

        textTransform: 'uppercase',

        marginBottom: 8,

    },

    detailTitle: {

        color: '#20352A',

        fontSize: 28,

        fontWeight: '800',

        lineHeight: 34,

        marginBottom: 20,

    },

    detailMatchCard: {

        backgroundColor: '#E7F1E6',

        borderRadius: 16,

        padding: 16,

        marginBottom: 24,

    },

    detailMatchTitle: {

        color: '#254632',

        fontSize: 16,

        fontWeight: '800',

        marginBottom: 6,

    },

    detailMatchSubtitle: {

        color: '#637568',

        fontSize: 13,

        marginBottom: 12,

    },

    ingredientRow: {

        flexDirection: 'row',

        alignItems: 'flex-start',

        marginBottom: 15,

    },

    ingredientStatus: {

        width: 25,

        height: 25,

        textAlign: 'center',

        textAlignVertical: 'center',

        borderRadius: 13,

        overflow: 'hidden',

        marginRight: 10,

        fontSize: 15,

        fontWeight: '800',

    },

    availableStatus: {

        backgroundColor: '#DCEFE0',

        color: '#27845C',

    },

    missingStatus: {

        backgroundColor: '#F7EBDD',

        color: '#9B6A35',

    },

    ingredientDetail: {

        flex: 1,

    },

    ingredientText: {

        color: '#465449',

        fontSize: 15,

        lineHeight: 22,

    },

    availabilityLabel: {

        fontSize: 12,

        marginTop: 3,

    },

    availableText: {

        color: '#27845C',

    },

    missingText: {

        color: '#9B6A35',

    },

    instructions: {

        color: '#465449',

        fontSize: 15,

        lineHeight: 24,

        marginTop: 2,

    },

    backToRecipesButton: {

        backgroundColor: '#27845C',

        padding: 15,

        borderRadius: 13,

        alignItems: 'center',

        marginTop: 28,

    },

    backToRecipesText: {

        color: '#FFFFFF',

        fontSize: 15,

        fontWeight: '800',

    },

});
