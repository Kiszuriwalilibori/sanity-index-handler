import express from "express";
import { createClient } from "@sanity/client";

const app = express();
app.use(express.json());

// Sanity client config (use env vars in production)
const client = createClient({
    projectId: process.env.SANITY_PROJECT_ID,
    dataset: process.env.SANITY_DATASET,
    token: process.env.SANITY_TOKEN,
    useCdn: false, // Live mode for mutations
});

// Handler function
app.post("/api/update-index", async (req, res) => {
    try {
        console.log("Webhook received:", req.body); // Log for debugging

        // Fetch all recipes with needed fields
        const recipes = await client.fetch(`
      *[_type == "recipe"] {
        title,
        tags,
        "ingredients": ingredients[].name,
        dietaryRestrictions,
        cuisine
      }
    `);

        // Compute unique sets
        const allTitles = new Set();
        const allTags = new Set();
        const allIngredients = new Set();
        const allDietary = new Set();
        const allCuisines = new Set();

        recipes.forEach(recipe => {
            if (recipe.title) allTitles.add(recipe.title);
            if (recipe.tags) recipe.tags.forEach(tag => allTags.add(tag));
            if (recipe.ingredients) recipe.ingredients.forEach(ing => allIngredients.add(ing));
            if (recipe.dietaryRestrictions) recipe.dietaryRestrictions.forEach(res => allDietary.add(res));
            if (recipe.cuisine) allCuisines.add(recipe.cuisine);
        });

        // Transactional update to index doc (create if missing)
        const transaction = client.transaction();
        transaction
            .patch("global-index")
            .set({
                titles: Array.from(allTitles),
                tags: Array.from(allTags),
                ingredients: Array.from(allIngredients),
                dietaryRestrictions: Array.from(allDietary),
                cuisines: Array.from(allCuisines),
                lastUpdated: new Date().toISOString(),
            })
            .commit();
        // If doc doesn't exist, fallback to create (but patch will auto-create in Sanity)

        await transaction;

        console.log("Index updated successfully");
        res.status(200).json({ success: true });
    } catch (error) {
        console.error("Error updating index:", error);
        res.status(500).json({ error: "Failed to update index" });
    }
});

export default app; // Export for Vercel
