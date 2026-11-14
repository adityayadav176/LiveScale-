import mongoose from "mongoose";

const connectToMongo = async() => {
    try {
        const connection = await mongoose.connect(process.env.MONGO_DB_URI);
        if(!connection) {
            throw new Error("Mongo DB Connection Failed");
        }
        console.log(`MongoDB Connected Successfully`, connection.connection.host);
    } catch (error) {
        console.log(error);
        process.exit(1);
    }
}

export {
    connectToMongo
}