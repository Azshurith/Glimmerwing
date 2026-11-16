import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { Timestamped } from './columns';

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
