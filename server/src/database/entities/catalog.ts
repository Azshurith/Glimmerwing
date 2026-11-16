import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { Timestamped, asJson } from './columns';
import type { MonsterRole, SpriteAtlas } from '@/types';

/** A fairy on the roster. One that's disabled (or deleted) can't be picked, and games with her aren't counted. */
@Entity('characters')
export class Character extends Timestamped {
    @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
    id!: number;

    /** The game's own id for it (e.g. 'pip', 'forest', 'cpu'). */
    @Column({ type: 'varchar', length: 16 })
    code!: string;

    @Column({ type: 'varchar', length: 32 })
    name!: string;

    /** Her spritesheet (a PNG; never read unless asked for) and its layout, or null for a fairy drawn in code. */
    @Column({ name: 'sprite_sheet', type: 'mediumblob', nullable: true, select: false })
    spriteSheet!: Buffer | null;

    @Column({ name: 'sprite_atlas', type: 'longtext', nullable: true, transformer: asJson })
    spriteAtlas!: SpriteAtlas | null;

    @Column({ name: 'is_enabled', type: 'boolean', default: true })
    isEnabled!: boolean;
}

/** A map (a stage). One that's disabled (or deleted) can't be played on. */
@Entity('maps')
export class GameMap extends Timestamped {
    @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
    id!: number;

    /** The game's own id for it (e.g. 'pip', 'forest', 'cpu'). */
    @Column({ type: 'varchar', length: 16 })
    code!: string;

    @Column({ type: 'varchar', length: 32 })
    name!: string;

    /** Its monster sheet (a PNG; never read unless asked for), cell size and overlay row (see the monsters table). */
    @Column({ name: 'monster_sheet', type: 'mediumblob', nullable: true, select: false })
    monsterSheet!: Buffer | null;

    @Column({ name: 'monster_cell', type: 'smallint', unsigned: true, nullable: true })
    monsterCell!: number | null;

    @Column({ name: 'monster_overlay_row', type: 'tinyint', unsigned: true, nullable: true })
    monsterOverlayRow!: number | null;

    @Column({ name: 'is_enabled', type: 'boolean', default: true })
    isEnabled!: boolean;
}

/** A game mode (cpu, versus, endless, online). One that's disabled (or deleted) can't be played or counted. */
@Entity('types_modes')
export class ModeType extends Timestamped {
    @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
    id!: number;

    /** The game's own id for it (e.g. 'pip', 'forest', 'cpu'). */
    @Column({ type: 'varchar', length: 12 })
    code!: string;

    @Column({ type: 'varchar', length: 32 })
    name!: string;

    @Column({ name: 'is_enabled', type: 'boolean', default: true })
    isEnabled!: boolean;
}

/** A monster on a map's sheet: its kind (code), name, what it plays in a formation, and its row. */
@Entity('monsters')
export class Monster extends Timestamped {
    @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
    id!: number;

    @Column({ name: 'map_id', type: 'int', unsigned: true })
    mapId!: number;

    @Column({ type: 'varchar', length: 16 })
    code!: string;

    @Column({ type: 'varchar', length: 32 })
    name!: string;

    @Column({ type: 'enum', enum: ['plain', 'big', 'shelled', 'spinner'] })
    role!: MonsterRole;

    @Column({ name: 'sheet_row', type: 'tinyint', unsigned: true })
    sheetRow!: number;
}
