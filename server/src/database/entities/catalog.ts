import { Column, Entity, PrimaryColumn } from 'typeorm';
import { Timestamped } from './columns';

/** A fairy on the roster. One that's disabled (or deleted) can't be picked, and games with her aren't counted. */
@Entity('characters')
export class Character extends Timestamped {
    @PrimaryColumn({ type: 'varchar', length: 16 })
    id!: string;

    @Column({ type: 'varchar', length: 32 })
    name!: string;

    @Column({ name: 'is_enabled', type: 'boolean', default: true })
    isEnabled!: boolean;
}

/** A map (a stage). One that's disabled (or deleted) can't be played on. */
@Entity('maps')
export class GameMap extends Timestamped {
    @PrimaryColumn({ type: 'varchar', length: 16 })
    id!: string;

    @Column({ type: 'varchar', length: 32 })
    name!: string;

    @Column({ name: 'is_enabled', type: 'boolean', default: true })
    isEnabled!: boolean;
}

/** A game mode (cpu, versus, endless, online): what matches and replays name in their mode column. */
@Entity('types_modes')
export class ModeType extends Timestamped {
    @PrimaryColumn({ type: 'varchar', length: 12 })
    id!: string;

    @Column({ type: 'varchar', length: 32 })
    name!: string;
}
