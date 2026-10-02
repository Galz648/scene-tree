export declare const GODOT_VERSION: string;
export declare const exists: (name: string) => boolean;
export declare const isInstantiable: (name: string) => boolean;
export declare function isA(name: string, ancestor: string): boolean;
export declare function familyOf(name: string): string;
export declare function concreteSubclasses(name: string): string[];
export declare function didYouMean(typed: string): string | null;
