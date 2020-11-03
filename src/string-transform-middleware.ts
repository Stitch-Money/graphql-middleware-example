import { UserInputError } from "apollo-server-koa";
import { ComposeOutputType, ListComposer, NamedTypeComposer, NonNullComposer, ObjectTypeComposer, ObjectTypeComposerFieldConfig, SchemaComposer, ThunkComposer } from "graphql-compose";

function injectArgs(fieldConfig: ObjectTypeComposerFieldConfig<any, any>, composer: SchemaComposer<any>) {
    if (!fieldConfig.args) {
        fieldConfig.args = {};
    }
    fieldConfig.args['textTransform'] = {
        type: composer.getETC('TextTransform'),
        description: 'Transforms string results into different forms',
    };
}

function toTitleCase(str: string) {
    return str.replace(
        /\w\S*/g,
        function (txt) {
            return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
        }
    );
}

function injectTextTransformEnum(composer: SchemaComposer<any>) {
    composer.add(`enum TextTransform { UPPERCASE lowercase TitleCase }`);
}

class NotAString extends Error { }
const NAS = new NotAString;

type TextTransform = 'UPPERCASE' | 'lowercase' | 'TitleCase';

function baseTransform(value: any, transform?: TextTransform) {
    if (!transform || typeof value !== 'string') {
        return value;
    }
    switch (transform) {
        case 'UPPERCASE':
            return value.toUpperCase();
        case 'lowercase':
            return value.toLowerCase();
        case 'TitleCase':
            return toTitleCase(value);
        default:
            throw new UserInputError(`Value out of range`);
    }
};

function maybeBuildTransform(fieldConfig: ObjectTypeComposerFieldConfig<any, any>, schemaComposer: SchemaComposer<any>, outputType: ComposeOutputType<any> | NamedTypeComposer<any>): ((value: any, transform?: TextTransform) => string) {
    if (outputType.getTypeName() === 'String') {
        // Field terminates in a String. Can happily return with the base transformation
        return baseTransform;
    }

    if (outputType instanceof NonNullComposer) {
        let currentOutputType = outputType.getUnwrappedTC();
        // We can just pretty much recurse here. Don't need to do anything for this type modifier
        return maybeBuildTransform(fieldConfig, schemaComposer, currentOutputType);
    }

    if (outputType instanceof ListComposer) {
        let currentOutputType = outputType.getUnwrappedTC();
        // Here have to filter as a list
        // Be careful, very NB to build the function out the closure otherwise you're going to get horrible perf.
        const subtransform = maybeBuildTransform(fieldConfig, schemaComposer, currentOutputType);
        return (currentValue, transform) => {
            if (!transform || !Array.isArray(currentValue)) {
                return currentValue;
            }
            return currentValue.map(x => subtransform(x, transform));
        }
    }

    if (outputType instanceof ThunkComposer) {
        let currentOutputType = outputType.getUnwrappedTC();
        // Thunks. Not too sure. They're really a mystery. Maybe something to do with cavemen.
        // Probably ok to just recurse.
        return maybeBuildTransform(fieldConfig, schemaComposer, currentOutputType);
    }

    // Not a String, or anything that can contain a string. Throw error to signal termination for this type
    throw NAS;
}

function maybeInjectTransform(
    fieldName: string,
    fieldConfig: ObjectTypeComposerFieldConfig<any, any>,
    schemaComposer: SchemaComposer<any>) {
    // Sometimes a particular resolver is not specified, so need to default to 
    // trying to get it from the source (AKA parent)
    if (!fieldConfig.resolve) {
        fieldConfig.resolve = (source) => source && typeof source === 'object' ? source[fieldName] : undefined;
    };

    const outputType = fieldConfig.type;

    // Now recursion happens. We want to check a. that the base type is a string, 
    // however there are many possible permutation of return type:
    // 
    // For example:
    // List of Maybe - Null Strings[String]!, 
    // Maybe Null List of Maybe Null Strings - [String], 
    // List of Strings[String!]!, 
    // List of List of Strings[[String]]
    // 
    // Because I'm lazy, we're going to be using exception handling for control flow. 
    // This is sometimes considered a no-no, largely for performance reasons, however
    // we're only really paying this cost once at start-up, so should be ok. 
    // 
    // To differentiate the exception from actual runtime errors, we will extend 
    // the base error type, calling it `NotAStringException`
    // 
    // We also will want to build the transform as we go. Another possible design here would be to do the type check
    // and transformations in multiple passes, which can be the way to go for more complex stuff.
    try {
        const transform = maybeBuildTransform(fieldConfig, schemaComposer, outputType);
        // Is a string, so can inject the arg 
        injectArgs(fieldConfig, schemaComposer);

        // Want a const ref to the original resolver so that we can use it in the replacement. 
        // Have to be careful because if you don't do this you can stand on your hands 
        // and will get infinite loops as a result.
        const resolver = fieldConfig.resolve;

        fieldConfig.resolve = async (source, args, context, info) => {
            const value = await Promise.resolve(resolver(source, args, context, info));
            return transform(value, typeof args === 'object' ? args['textTransform'] : undefined);
        }
    } catch (e) {
        if (!(e instanceof NotAString)) {
            throw e;
        } else {
            ; // Do nothing, this field doesn't have strings in it, so don't need to do anything
        }
    }
}


export function injectStringTransformMiddleware<Composer extends SchemaComposer<unknown>>(composer: Composer) {
    injectTextTransformEnum(composer);

    // Iterate over all types, plucking out those that are concrete types
    for (let typeComposer of composer.types.values()) {
        if (!(typeComposer instanceof ObjectTypeComposer)) {
            // Not a concrete type, so no String fields to rewrite
            continue;
        }

        const type = typeComposer.getType();
        for (let fieldName in type.getFields()) {
            let fieldConfig = typeComposer.getField(fieldName);
            maybeInjectTransform(fieldName, fieldConfig, composer);
        }
    }
}
